// Daytona's REST API called with fetch, for the redesign job.
//
// Why not @daytona/sdk: the job runs in the Worker's queue consumer, and the
// SDK does not bundle for Workers. It depends on @aws-sdk/client-s3,
// OpenTelemetry's Node SDK, tar, ws and socket.io-client, and uses axios's
// Node HTTP adapter. The job needs six calls, so they are written out here
// with the same paths and bodies the SDK 0.233 sends (recorded from a traced
// run, 21 November). The SDK stays for building snapshots on a laptop
// (scripts/daytona/build-snapshot.mts).
//
//   POST   {api}/sandbox                          create from a snapshot
//   GET    {api}/sandbox/{id}                     state, while it starts
//   GET    {api}/sandbox?labels=<json>            find a job's sandboxes
//   DELETE {api}/sandbox/{id}                     delete
//   POST   {toolbox}/{id}/files/bulk-upload       multipart, files[i].path + files[i].file
//   POST   {toolbox}/{id}/process/execute         { command, cwd, envs, timeout }
//   GET    {toolbox}/{id}/files/info?path=        { size, ... }
//   GET    {toolbox}/{id}/files/download?path=    the file's bytes
//
// No server-only import: this file only uses fetch and the key it is given.
import type { SandboxHandle, SandboxParams, Sandboxes } from "./redesign"

export class DaytonaApiError extends Error {
  override name = "DaytonaApiError"
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

export type RestSettings = { daytonaKey: string; apiUrl: string; target: string }

type SandboxDto = { id: string; state?: string; errorReason?: string | null; toolboxProxyUrl?: string | null }

// The toolbox proxy for the EU region, used when a create response does not
// name one (it normally does, as toolboxProxyUrl).
const FALLBACK_TOOLBOX = "https://proxy.app-eu.daytona.io/toolbox"

export function restSandboxes(settings: RestSettings, fetchImpl: typeof fetch = fetch): Sandboxes {
  const api = settings.apiUrl.replace(/\/+$/, "")
  const auth = { Authorization: `Bearer ${settings.daytonaKey}`, "X-Daytona-Source": "majnu-rest" }

  async function call(url: string, init: RequestInit & { timeoutSeconds: number }): Promise<Response> {
    const { timeoutSeconds, ...rest } = init
    const response = await fetchImpl(url, {
      ...rest,
      headers: { ...auth, ...(rest.headers as Record<string, string> | undefined) },
      signal: AbortSignal.timeout(timeoutSeconds * 1000),
    })
    if (!response.ok) {
      const text = await response.text().catch(() => "")
      // Daytona answers {"message": "..."}; the job matches on that text (the tier fallback).
      let message = text.slice(0, 500)
      try {
        const parsed = JSON.parse(text) as { message?: unknown }
        if (typeof parsed.message === "string") message = parsed.message
      } catch {
        // Not JSON: keep the text.
      }
      throw new DaytonaApiError(`Daytona ${rest.method ?? "GET"} ${new URL(url).pathname} failed (${response.status}): ${message}`, response.status)
    }
    return response
  }

  async function json<T>(url: string, init: RequestInit & { timeoutSeconds: number }): Promise<T> {
    return (await (await call(url, init)).json()) as T
  }

  function handle(id: string, toolboxBase: string): SandboxHandle {
    const toolbox = `${toolboxBase.replace(/\/+$/, "")}/${encodeURIComponent(id)}`
    const fileUrl = (action: string, path: string) => `${toolbox}/files/${action}?path=${encodeURIComponent(path)}`
    return {
      id,
      fs: {
        async uploadFiles(files, timeout = 60) {
          const form = new FormData()
          files.forEach(({ source, destination }, i) => {
            form.append(`files[${i}].path`, destination)
            form.append(`files[${i}].file`, new Blob([new Uint8Array(source)]), destination)
          })
          await call(`${toolbox}/files/bulk-upload`, { method: "POST", body: form, timeoutSeconds: timeout })
        },
        async getFileDetails(path) {
          const info = await json<{ size?: unknown }>(fileUrl("info", path), { method: "GET", timeoutSeconds: 30 })
          if (typeof info.size !== "number") throw new DaytonaApiError(`Daytona file info for ${path} has no size`, 500)
          return { size: info.size }
        },
        async downloadFile(path, timeout = 60) {
          const response = await call(fileUrl("download", path), { method: "GET", timeoutSeconds: timeout })
          return Buffer.from(await response.arrayBuffer())
        },
      },
      process: {
        async executeCommand(command, cwd, env, timeout = 60) {
          // The HTTP call waits for the command; give it a little longer than
          // the command's own limit.
          const out = await json<{ exitCode?: unknown; result?: unknown }>(`${toolbox}/process/execute`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ command, timeout, ...(cwd ? { cwd } : {}), ...(env ? { envs: env } : {}) }),
            timeoutSeconds: timeout + 30,
          })
          return { exitCode: typeof out.exitCode === "number" ? out.exitCode : -1, result: typeof out.result === "string" ? out.result : "" }
        },
      },
      async delete(timeout = 60) {
        await call(`${api}/sandbox/${encodeURIComponent(id)}`, { method: "DELETE", timeoutSeconds: timeout })
      },
    }
  }

  return {
    async create(params: SandboxParams, options: { timeout: number }) {
      const deadline = Date.now() + options.timeout * 1000
      const body = {
        snapshot: params.snapshot,
        env: {},
        labels: params.labels ?? {},
        target: settings.target,
        // An ephemeral sandbox is deleted as soon as it stops.
        ...(params.ephemeral ? { autoDeleteInterval: 0 } : {}),
        ...(params.ttlMinutes !== undefined ? { ttlMinutes: params.ttlMinutes } : {}),
        ...(params.domainAllowList ? { domainAllowList: params.domainAllowList } : {}),
      }
      let sandbox = await json<SandboxDto>(`${api}/sandbox`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        timeoutSeconds: options.timeout,
      })
      // Snapshots usually come back started; otherwise wait for it.
      while (sandbox.state !== "started") {
        if (sandbox.state === "error" || sandbox.state === "build_failed") {
          throw new DaytonaApiError(`Sandbox ${sandbox.id} failed to start: ${sandbox.errorReason ?? sandbox.state}`, 500)
        }
        if (Date.now() > deadline) throw new DaytonaApiError(`Sandbox ${sandbox.id} did not start within ${options.timeout} s`, 504)
        await new Promise((resolve) => setTimeout(resolve, 1000))
        sandbox = await json<SandboxDto>(`${api}/sandbox/${encodeURIComponent(sandbox.id)}`, { method: "GET", timeoutSeconds: 30 })
      }
      let toolbox = sandbox.toolboxProxyUrl
      if (!toolbox) {
        toolbox = await json<{ url?: string }>(`${api}/sandbox/${encodeURIComponent(sandbox.id)}/toolbox-proxy-url`, { method: "GET", timeoutSeconds: 30 })
          .then((r) => r.url)
          .catch(() => undefined)
      }
      return handle(sandbox.id, toolbox || FALLBACK_TOOLBOX)
    },

    async deleteByLabels(labels) {
      const url = `${api}/sandbox?labels=${encodeURIComponent(JSON.stringify(labels))}`
      const listed = await json<SandboxDto[] | { items?: SandboxDto[] }>(url, { method: "GET", timeoutSeconds: 30 })
      // Daytona answers { items, nextCursor }; one job has one sandbox, so the first page is enough.
      const sandboxes = Array.isArray(listed) ? listed : (listed.items ?? [])
      let deleted = 0
      for (const sandbox of sandboxes) {
        // The listing lags: a sandbox already on its way out answers 409 (or 404 once gone).
        if (sandbox.state === "destroyed" || sandbox.state === "destroying") continue
        try {
          await call(`${api}/sandbox/${encodeURIComponent(sandbox.id)}`, { method: "DELETE", timeoutSeconds: 60 })
          deleted++
        } catch (error) {
          if (!(error instanceof DaytonaApiError && (error.status === 404 || error.status === 409))) throw error
        }
      }
      return deleted
    },
  }
}
