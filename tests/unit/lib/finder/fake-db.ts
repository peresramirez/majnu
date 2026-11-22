// An in-memory stand-in for the Supabase query builder, for the finder's limit
// tests (limits.test.ts, pool-limits.test.ts): just the calls the limits make
// on finder_searches and finder_sessions. Not a test file itself.
type Row = Record<string, unknown>

export const fakeDb: {
  tables: Record<string, Row[]>
  nextId: number
  now: Date
  // The next count or select fails, as a lost connection would.
  failNextRead: boolean
} = { tables: { finder_searches: [], finder_sessions: [] }, nextId: 1, now: new Date(), failNextRead: false }

export function resetFakeDb(now: Date) {
  fakeDb.tables = { finder_searches: [], finder_sessions: [] }
  fakeDb.nextId = 1
  fakeDb.now = now
  fakeDb.failNextRead = false
}

// "context->calendar": one level into a JSON column is all these queries use.
function valueAt(row: Row, column: string): unknown {
  const [col, key] = column.split("->")
  return key ? (row[col] as Record<string, unknown> | undefined)?.[key] : row[col]
}

function query(table: string) {
  const filters: ((row: Row) => boolean)[] = []
  let op: "select" | "insert" | "delete" = "select"
  let head = false
  let inserted: Row | null = null
  let order: { column: string; ascending: boolean } | null = null
  let limit = Infinity
  const builder = {
    select(_columns?: string, options?: { count?: string; head?: boolean }) {
      if (op !== "insert") head = options?.head === true
      return builder
    },
    insert(row: Row) {
      op = "insert"
      inserted = { id: fakeDb.nextId++, created_at: fakeDb.now.toISOString(), ...row }
      return builder
    },
    delete() {
      op = "delete"
      return builder
    },
    eq(column: string, value: unknown) {
      filters.push((row) => valueAt(row, column) === value)
      return builder
    },
    gte(column: string, value: string) {
      filters.push((row) => String(valueAt(row, column)) >= value)
      return builder
    },
    in(column: string, values: unknown[]) {
      filters.push((row) => values.includes(valueAt(row, column)))
      return builder
    },
    is(column: string, value: null) {
      if (value !== null) throw new Error("unsupported filter")
      filters.push((row) => valueAt(row, column) === undefined || valueAt(row, column) === null)
      return builder
    },
    not(column: string, operator: string, value: unknown) {
      if (operator !== "is" || value !== null) throw new Error("unsupported filter")
      filters.push((row) => valueAt(row, column) !== undefined && valueAt(row, column) !== null)
      return builder
    },
    order(column: string, options?: { ascending?: boolean }) {
      order = { column, ascending: options?.ascending !== false }
      return builder
    },
    limit(n: number) {
      limit = n
      return builder
    },
    returns() {
      return builder
    },
    single() {
      return builder
    },
    then(resolve: (value: unknown) => void) {
      const rows = fakeDb.tables[table]
      if (op === "insert") {
        rows.push(inserted!)
        return resolve({ data: { id: inserted!.id }, error: null })
      }
      let matching = rows.filter((row) => filters.every((f) => f(row)))
      if (op === "delete") {
        fakeDb.tables[table] = rows.filter((row) => !matching.includes(row))
        return resolve({ error: null })
      }
      if (fakeDb.failNextRead) {
        fakeDb.failNextRead = false
        return resolve({ data: null, count: null, error: { message: "connection reset" } })
      }
      if (order) {
        const { column, ascending } = order
        matching = [...matching].sort((a, b) => (String(a[column]) < String(b[column]) ? -1 : 1) * (ascending ? 1 : -1))
      }
      matching = matching.slice(0, limit)
      return resolve(head ? { data: null, count: matching.length, error: null } : { data: matching, count: null, error: null })
    },
  }
  return builder
}

export const fakeClient = { from: query }
