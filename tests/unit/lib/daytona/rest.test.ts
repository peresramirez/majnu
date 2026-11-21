// The fetch-based Daytona client against a fake fetch: the paths, bodies and
// headers it sends (the ones @daytona/sdk 0.233 sends, recorded from a traced
// run), and how it reports Daytona's errors. No network.
import { describe, expect, it, vi } from "vitest"
import { restSandboxes } from "@/lib/daytona/rest"

const SETTINGS = { daytonaKey: "dtn_test_key_123456", apiUrl: "https://app.daytona.io/api/", target: "eu" }
const TOOLBOX = "https://proxy.app-eu.daytona.io/toolbox"

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown }

function fakeFetch(responses: Array<(call: Call) => Response>) {
  const calls: Call[] = []
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: Call = { url: String(input), method: init?.method ?? "GET", headers: (init?.headers ?? {}) as Record<string, string>, body: init?.body }
    calls.push(call)
    const next = responses.shift()
    if (!next) throw new Error(`unexpected request ${call.method} ${call.url}`)
    return next(call)
  })
  return { calls, fetchImpl: fetchImpl as unknown as typeof fetch }
}

const json = (body: unknown, status = 200) => () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

describe("restSandboxes", () => {
  it("creates an ephemeral sandbox from the snapshot with the job's labels and TTL", async () => {
    const { calls, fetchImpl } = fakeFetch([json({ id: "sb1", state: "started", toolboxProxyUrl: TOOLBOX })])
    const sandbox = await restSandboxes(SETTINGS, fetchImpl).create(
      { snapshot: "majnu-letters-v1", labels: { app: "majnu", job: "j1" }, ephemeral: true, ttlMinutes: 20, domainAllowList: "api.anthropic.com" },
      { timeout: 180 },
    )
    expect(sandbox.id).toBe("sb1")
    expect(calls[0]).toMatchObject({ url: "https://app.daytona.io/api/sandbox", method: "POST" })
    expect(calls[0].headers.Authorization).toBe("Bearer dtn_test_key_123456")
    expect(JSON.parse(String(calls[0].body))).toEqual({
      snapshot: "majnu-letters-v1",
      env: {},
      labels: { app: "majnu", job: "j1" },
      target: "eu",
      autoDeleteInterval: 0,
      ttlMinutes: 20,
      domainAllowList: "api.anthropic.com",
    })
  })

  it("waits until a sandbox that is still starting has started", async () => {
    vi.useFakeTimers()
    try {
      const { calls, fetchImpl } = fakeFetch([json({ id: "sb1", state: "starting" }), json({ id: "sb1", state: "started", toolboxProxyUrl: TOOLBOX })])
      const created = restSandboxes(SETTINGS, fetchImpl).create({ snapshot: "s" }, { timeout: 60 })
      await vi.advanceTimersByTimeAsync(1000)
      expect((await created).id).toBe("sb1")
      expect(calls[1]).toMatchObject({ url: "https://app.daytona.io/api/sandbox/sb1", method: "GET" })
    } finally {
      vi.useRealTimers()
    }
  })

  it("puts Daytona's own message in the error, so the job can recognise the tier's network policy", async () => {
    const { fetchImpl } = fakeFetch([json({ message: "Network access is restricted and cannot be overridden for this tier" }, 403)])
    await expect(restSandboxes(SETTINGS, fetchImpl).create({ snapshot: "s", domainAllowList: "x" }, { timeout: 10 })).rejects.toThrow(
      /\(403\): Network access is restricted and cannot be overridden/,
    )
  })

  it("uploads, runs, inspects, downloads and deletes through the toolbox paths", async () => {
    const { calls, fetchImpl } = fakeFetch([
      json({ id: "sb1", state: "started", toolboxProxyUrl: TOOLBOX }),
      json({ files: [] }),
      json({ exitCode: 0, result: "ok\n" }),
      json({ name: "index.html", size: 15000 }),
      () => new Response("<!doctype html><p>page</p>"),
      json({ id: "sb1", state: "destroying" }),
    ])
    const sandbox = await restSandboxes(SETTINGS, fetchImpl).create({ snapshot: "s" }, { timeout: 10 })

    await sandbox.fs.uploadFiles([{ source: Buffer.from("hello"), destination: "/home/daytona/letter/input/request.txt" }], 60)
    const upload = calls[1]
    expect(upload).toMatchObject({ url: `${TOOLBOX}/sb1/files/bulk-upload`, method: "POST" })
    const form = upload.body as FormData
    expect(form.get("files[0].path")).toBe("/home/daytona/letter/input/request.txt")
    expect(await (form.get("files[0].file") as Blob).text()).toBe("hello")

    const run = await sandbox.process.executeCommand("bash -c 'echo ok'", "/home/daytona/letter", { MAJNU_MODEL: "m" }, 420)
    expect(run).toEqual({ exitCode: 0, result: "ok\n" })
    expect(calls[2]).toMatchObject({ url: `${TOOLBOX}/sb1/process/execute`, method: "POST" })
    // The key for the run travels as the command's environment, never in the command text.
    expect(JSON.parse(String(calls[2].body))).toEqual({ command: "bash -c 'echo ok'", timeout: 420, cwd: "/home/daytona/letter", envs: { MAJNU_MODEL: "m" } })

    expect(await sandbox.fs.getFileDetails("/home/daytona/letter/out/index.html")).toEqual({ size: 15000 })
    expect(calls[3].url).toBe(`${TOOLBOX}/sb1/files/info?path=%2Fhome%2Fdaytona%2Fletter%2Fout%2Findex.html`)

    expect((await sandbox.fs.downloadFile("/home/daytona/letter/out/index.html", 60)).toString("utf8")).toBe("<!doctype html><p>page</p>")
    expect(calls[4].url).toBe(`${TOOLBOX}/sb1/files/download?path=%2Fhome%2Fdaytona%2Fletter%2Fout%2Findex.html`)

    await sandbox.delete(60, true)
    expect(calls[5]).toMatchObject({ url: "https://app.daytona.io/api/sandbox/sb1", method: "DELETE" })
  })

  it("deletes every sandbox carrying the job's labels, skipping those already on their way out", async () => {
    const { calls, fetchImpl } = fakeFetch([
      json({ items: [{ id: "a", state: "started" }, { id: "old", state: "destroying" }, { id: "b", state: "creating" }, { id: "c", state: "started" }], nextCursor: null }),
      json({}),
      json({}),
      json({ message: "Sandbox state change in progress" }, 409),
    ])
    expect(await restSandboxes(SETTINGS, fetchImpl).deleteByLabels({ job: "j1" })).toBe(2)
    expect(calls[0].url).toBe(`https://app.daytona.io/api/sandbox?labels=${encodeURIComponent('{"job":"j1"}')}`)
    expect(calls.slice(1).map((c) => `${c.method} ${c.url}`)).toEqual([
      "DELETE https://app.daytona.io/api/sandbox/a",
      "DELETE https://app.daytona.io/api/sandbox/b",
      "DELETE https://app.daytona.io/api/sandbox/c",
    ])
  })
})
