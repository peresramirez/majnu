// An in-memory stand-in for the parts of supabase-js the voice-note code uses:
// table queries (select, eq, in, order, limit, maybeSingle, single, insert,
// upsert, update, delete), rpc and Storage. It mirrors what
// supabase/migrations/0008_audio_notes.sql does in the database (checked in
// PGlite, see docs/features/audio-note.md): one note per letter, and the
// trigger that queues the old file of every deleted or replaced note.
type Row = Record<string, unknown>
type Result = { data: unknown; error: { message: string; code?: string } | null }

export type FakeOptions = {
  // Row-level security for a user's client: which rows `userId` may see.
  userId?: string | null
}

export function createFakeSupabase(seed: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = {}
  for (const [name, rows] of Object.entries(seed)) tables[name] = rows.map((row) => ({ ...row }))
  const files = new Map<string, Blob>()
  const failures = new Map<string, string>()
  const rpcs = new Map<string, (args: Record<string, unknown>) => Result>()
  const log: string[] = []

  const table = (name: string) => (tables[name] ??= [])

  // What the database's own triggers do (0008).
  function queueDeletion(path: unknown) {
    const queue = table("audio_note_deletions")
    if (!queue.some((row) => row.storage_path === path)) queue.push({ storage_path: path, queued_at: new Date(Date.now() + queue.length).toISOString() })
  }

  function visible(name: string, row: Row, userId: string | null | undefined): boolean {
    if (userId === undefined) return true // service role
    if (userId === null) return false
    if (name === "letters" || name === "letter_audio_notes") return row.owner_id === userId
    if (name === "audio_note_uploads" || name === "voice_transcriptions") return row.user_id === userId
    return false
  }

  class Query implements PromiseLike<Result> {
    private op: "select" | "insert" | "upsert" | "update" | "delete" = "select"
    private filters: ((row: Row) => boolean)[] = []
    private payload: Row | Row[] | null = null
    private conflict: string | null = null
    private returning = false
    private mode: "one" | "maybe" | null = null
    private orderBy: { key: string; ascending: boolean } | null = null
    private max: number | null = null

    constructor(
      private name: string,
      private userId: string | null | undefined,
    ) {}

    select(_columns?: string) {
      if (this.op !== "select") this.returning = true
      return this
    }
    eq(key: string, value: unknown) {
      this.filters.push((row) => row[key] === value)
      return this
    }
    in(key: string, values: unknown[]) {
      this.filters.push((row) => values.includes(row[key]))
      return this
    }
    order(key: string, opts: { ascending?: boolean } = {}) {
      this.orderBy = { key, ascending: opts.ascending !== false }
      return this
    }
    limit(n: number) {
      this.max = n
      return this
    }
    returns() {
      return this
    }
    maybeSingle() {
      this.mode = "maybe"
      return this
    }
    single() {
      this.mode = "one"
      return this
    }
    insert(payload: Row | Row[]) {
      this.op = "insert"
      this.payload = payload
      return this
    }
    upsert(payload: Row | Row[], opts: { onConflict?: string } = {}) {
      this.op = "upsert"
      this.payload = payload
      this.conflict = opts.onConflict ?? "id"
      return this
    }
    update(payload: Row) {
      this.op = "update"
      this.payload = payload
      return this
    }
    delete() {
      this.op = "delete"
      return this
    }

    then<A = Result, B = never>(resolve?: ((value: Result) => A | PromiseLike<A>) | null, reject?: ((reason: unknown) => B | PromiseLike<B>) | null) {
      return Promise.resolve(this.run()).then(resolve, reject)
    }

    private run(): Result {
      const key = `${this.name}.${this.op}`
      log.push(key)
      const failure = failures.get(key)
      if (failure) {
        failures.delete(key)
        return { data: null, error: { message: failure } }
      }
      const rows = table(this.name)
      const writable = this.userId === undefined
      if (this.op !== "select" && !writable) return { data: null, error: { message: "permission denied", code: "42501" } }

      if (this.op === "select") {
        let found = rows.filter((row) => visible(this.name, row, this.userId) && this.filters.every((f) => f(row)))
        if (this.orderBy) {
          const { key: k, ascending } = this.orderBy
          found = [...found].sort((a, b) => (String(a[k]) < String(b[k]) ? -1 : 1) * (ascending ? 1 : -1))
        }
        if (this.max !== null) found = found.slice(0, this.max)
        return this.shape(found)
      }

      if (this.op === "insert" || this.op === "upsert") {
        const incoming = Array.isArray(this.payload) ? this.payload : [this.payload!]
        const written: Row[] = []
        for (const input of incoming) {
          const existing = this.op === "upsert" ? rows.find((row) => row[this.conflict!] === input[this.conflict!]) : undefined
          if (existing) {
            const oldPath = existing.storage_path
            Object.assign(existing, input, { updated_at: new Date().toISOString() })
            if (this.name === "letter_audio_notes" && existing.storage_path !== oldPath) queueDeletion(oldPath)
            written.push(existing)
          } else {
            if (this.name === "letter_audio_notes" && rows.some((row) => row.letter_id === input.letter_id)) {
              return { data: null, error: { message: "duplicate key value violates unique constraint", code: "23505" } }
            }
            const row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...input }
            rows.push(row)
            written.push(row)
          }
        }
        return this.returning ? this.shape(written) : { data: null, error: null }
      }

      const matching = rows.filter((row) => this.filters.every((f) => f(row)))
      if (this.op === "update") {
        for (const row of matching) {
          const oldPath = row.storage_path
          Object.assign(row, this.payload, { updated_at: new Date().toISOString() })
          if (this.name === "letter_audio_notes" && row.storage_path !== oldPath) queueDeletion(oldPath)
        }
        return this.returning ? this.shape(matching) : { data: null, error: null }
      }

      // delete
      tables[this.name] = rows.filter((row) => !matching.includes(row))
      if (this.name === "letter_audio_notes") for (const row of matching) queueDeletion(row.storage_path)
      if (this.name === "letters") {
        // on delete cascade, and the trigger on the note.
        const ids = matching.map((row) => row.id)
        const notes = table("letter_audio_notes").filter((row) => ids.includes(row.letter_id))
        tables.letter_audio_notes = table("letter_audio_notes").filter((row) => !notes.includes(row))
        for (const note of notes) queueDeletion(note.storage_path)
      }
      return this.returning ? this.shape(matching) : { data: null, error: null }
    }

    private shape(found: Row[]): Result {
      const copies = found.map((row) => ({ ...row }))
      if (this.mode === "maybe") {
        if (copies.length > 1) return { data: null, error: { message: "multiple rows" } }
        return { data: copies[0] ?? null, error: null }
      }
      if (this.mode === "one") {
        if (copies.length !== 1) return { data: null, error: { message: "expected one row" } }
        return { data: copies[0], error: null }
      }
      return { data: copies, error: null }
    }
  }

  const makeQuery = (name: string, userId: string | null | undefined) => new Query(name, userId)

  const storage = {
    from(bucket: string) {
      return {
        async upload(path: string, body: Blob, opts: { contentType?: string; upsert?: boolean } = {}) {
          log.push(`storage.upload ${bucket}/${path}`)
          const failure = failures.get("storage.upload")
          if (failure) {
            failures.delete("storage.upload")
            return { data: null, error: { message: failure } }
          }
          if (files.has(path) && !opts.upsert) return { data: null, error: { message: "The resource already exists" } }
          files.set(path, new Blob([await body.arrayBuffer()], { type: opts.contentType ?? body.type }))
          return { data: { path }, error: null }
        },
        async remove(paths: string[]) {
          log.push(`storage.remove ${paths.join(",")}`)
          const failure = failures.get("storage.remove")
          if (failure) {
            failures.delete("storage.remove")
            return { data: null, error: { message: failure } }
          }
          for (const path of paths) files.delete(path)
          return { data: paths.map((name) => ({ name })), error: null }
        },
        async download(path: string) {
          const file = files.get(path)
          return file ? { data: file, error: null } : { data: null, error: { message: "Object not found" } }
        },
      }
    },
  }

  return {
    tables,
    files,
    log,
    // The next call of this kind fails with `message`: "letters.select",
    // "letter_audio_notes.upsert", "storage.upload", "storage.remove", ...
    failNext(key: string, message = "boom") {
      failures.set(key, message)
    },
    onRpc(name: string, handler: (args: Record<string, unknown>) => Result) {
      rpcs.set(name, handler)
    },
    // The service-role client: no row-level security.
    admin: {
      from: (name: string) => makeQuery(name, undefined),
      rpc: async (name: string, args: Record<string, unknown>) => {
        log.push(`rpc ${name}`)
        const handler = rpcs.get(name)
        return handler ? handler(args) : { data: null, error: { message: `no rpc ${name}` } }
      },
      storage,
    },
    // A signed-in user's client: reads limited to their own rows, no writes.
    userClient: (userId: string | null) => ({
      from: (name: string) => makeQuery(name, userId),
    }),
  }
}
