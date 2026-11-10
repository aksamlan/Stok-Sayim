import type { DatabaseSync } from "node:sqlite"
import { ApiError } from "./auth"
import { catalogSize } from "./catalog"

export type ScanEvent = {
  id: string
  sessionId: string
  barcode: string
  qty: number
  createdAt: number
}

export type DashboardRow = {
  barcode: string
  name: string | null
  category: string | null
  expected: number | null
  counted: number
  status: "match" | "difference" | "only-stock" | "only-count"
}

export type DashboardResult = {
  totals: {
    totalQty: number
    distinctCounted: number
    counters: number
    unknownCount: number
    catalogCount: number
  }
  byCounter: { counter: string; qty: number; distinct: number; lastAt: number }[]
  byCategory: {
    category: string | null
    counted: number
    expected: number
    distinct: number
  }[]
  rows: DashboardRow[]
  rowTotal: number
}

function assertActiveSession(db: DatabaseSync, storeId: string, sessionId: string) {
  const row = db
    .prepare("SELECT status FROM sessions WHERE id = ? AND store_id = ?")
    .get(sessionId, storeId) as { status: string } | undefined
  if (!row) throw new ApiError(404, "Sayım oturumu bulunamadı")
  if (row.status !== "active") throw new ApiError(409, "Bu sayım kapatılmış")
}

export function recordEvents(
  db: DatabaseSync,
  storeId: string,
  counter: string,
  events: ScanEvent[]
): { accepted: number } {
  if (!Array.isArray(events) || events.length === 0) return { accepted: 0 }
  const sessionId = events[0].sessionId
  for (const e of events) {
    if (
      typeof e.id !== "string" ||
      !e.id ||
      e.sessionId !== sessionId ||
      typeof e.barcode !== "string" ||
      !e.barcode ||
      !Number.isInteger(e.qty)
    ) {
      throw new ApiError(400, "Geçersiz sayım verisi")
    }
  }
  assertActiveSession(db, storeId, sessionId)
  const insert = db.prepare(
    "INSERT OR IGNORE INTO scan_events (id, store_id, session_id, counter, barcode, qty, created_at, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  )
  let accepted = 0
  const now = Date.now()
  db.exec("BEGIN")
  try {
    for (const e of events) {
      const r = insert.run(
        e.id,
        storeId,
        sessionId,
        counter,
        e.barcode.trim(),
        e.qty,
        e.createdAt,
        now
      )
      accepted += Number(r.changes)
    }
    db.exec("COMMIT")
  } catch (err) {
    db.exec("ROLLBACK")
    throw err
  }
  return { accepted }
}

export function myCounts(
  db: DatabaseSync,
  storeId: string,
  sessionId: string,
  counter: string
): { barcode: string; qty: number }[] {
  return db
    .prepare(
      `SELECT barcode, SUM(qty) AS qty FROM scan_events
       WHERE store_id = ? AND session_id = ? AND counter = ?
       GROUP BY barcode HAVING SUM(qty) > 0
       ORDER BY MAX(received_at) DESC`
    )
    .all(storeId, sessionId, counter) as { barcode: string; qty: number }[]
}

const ROWS_CTE = `
WITH agg AS (
  SELECT barcode, SUM(qty) AS counted
  FROM scan_events
  WHERE store_id = ? AND session_id = ?
  GROUP BY barcode
),
all_rows AS (
  SELECT p.barcode AS barcode, p.name AS name, p.category AS category,
         p.expected_qty AS expected, COALESCE(a.counted, 0) AS counted,
         1 AS in_catalog
  FROM products p LEFT JOIN agg a ON a.barcode = p.barcode
  WHERE p.store_id = ?
  UNION ALL
  SELECT a.barcode, NULL, NULL, NULL, a.counted, 0
  FROM agg a
  WHERE a.counted <> 0
    AND NOT EXISTS (SELECT 1 FROM products p WHERE p.store_id = ? AND p.barcode = a.barcode)
),
statused AS (
  SELECT barcode, name, category, expected, counted,
    CASE
      WHEN in_catalog = 0 THEN 'only-count'
      WHEN counted = 0 THEN 'only-stock'
      WHEN expected IS NULL THEN 'match'
      WHEN counted = expected THEN 'match'
      ELSE 'difference'
    END AS status
  FROM all_rows
)
`

export function dashboard(
  db: DatabaseSync,
  storeId: string,
  sessionId: string,
  opts: {
    filter: "problems" | "all"
    search?: string
    category?: string
    page: number
    pageSize: number
  }
): DashboardResult {
  const pageSize = Math.min(Math.max(1, opts.pageSize), 10000)
  const page = Math.max(1, opts.page)

  const where: string[] = []
  const whereParams: (string | number)[] = []
  if (opts.filter === "problems") where.push("status <> 'match'")
  if (opts.category) {
    where.push("category = ?")
    whereParams.push(opts.category)
  }
  if (opts.search?.trim()) {
    where.push("(barcode LIKE ? OR name LIKE ? COLLATE NOCASE)")
    const like = `%${opts.search.trim()}%`
    whereParams.push(like, like)
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : ""
  const cteParams = [storeId, sessionId, storeId, storeId]

  const rows = db
    .prepare(
      `${ROWS_CTE} SELECT * FROM statused ${whereSql}
       ORDER BY (status = 'only-count') DESC, category IS NULL, category, barcode
       LIMIT ? OFFSET ?`
    )
    .all(...cteParams, ...whereParams, pageSize, (page - 1) * pageSize) as DashboardRow[]

  const rowTotal = (
    db
      .prepare(`${ROWS_CTE} SELECT COUNT(*) AS n FROM statused ${whereSql}`)
      .get(...cteParams, ...whereParams) as { n: number }
  ).n

  const totalsRow = db
    .prepare(
      `SELECT COALESCE(SUM(t), 0) AS totalQty, COUNT(*) AS distinctCounted FROM (
         SELECT SUM(qty) AS t FROM scan_events WHERE store_id = ? AND session_id = ?
         GROUP BY barcode HAVING SUM(qty) <> 0
       )`
    )
    .get(storeId, sessionId) as { totalQty: number; distinctCounted: number }

  const countersRow = db
    .prepare(
      "SELECT COUNT(DISTINCT counter) AS n FROM scan_events WHERE store_id = ? AND session_id = ?"
    )
    .get(storeId, sessionId) as { n: number }

  const unknownRow = db
    .prepare(
      `SELECT COUNT(*) AS n FROM (
         SELECT barcode, SUM(qty) AS t FROM scan_events
         WHERE store_id = ? AND session_id = ? GROUP BY barcode HAVING SUM(qty) <> 0
       ) a
       WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.store_id = ? AND p.barcode = a.barcode)`
    )
    .get(storeId, sessionId, storeId) as { n: number }

  const byCounter = db
    .prepare(
      `SELECT counter, COALESCE(SUM(qty), 0) AS qty, COUNT(DISTINCT barcode) AS distinct_n,
              MAX(created_at) AS lastAt
       FROM scan_events WHERE store_id = ? AND session_id = ?
       GROUP BY counter ORDER BY qty DESC`
    )
    .all(storeId, sessionId) as {
    counter: string
    qty: number
    distinct_n: number
    lastAt: number
  }[]

  const byCategory = db
    .prepare(
      `${ROWS_CTE} SELECT category, COALESCE(SUM(counted), 0) AS counted,
         COALESCE(SUM(expected), 0) AS expected,
         SUM(counted <> 0) AS distinct_n
       FROM statused GROUP BY category
       ORDER BY category IS NULL, category`
    )
    .all(...cteParams) as {
    category: string | null
    counted: number
    expected: number
    distinct_n: number
  }[]

  return {
    totals: {
      totalQty: totalsRow.totalQty,
      distinctCounted: totalsRow.distinctCounted,
      counters: countersRow.n,
      unknownCount: unknownRow.n,
      catalogCount: catalogSize(db, storeId),
    },
    byCounter: byCounter.map((c) => ({
      counter: c.counter,
      qty: c.qty,
      distinct: c.distinct_n,
      lastAt: c.lastAt,
    })),
    byCategory: byCategory.map((c) => ({
      category: c.category,
      counted: c.counted,
      expected: c.expected,
      distinct: c.distinct_n,
    })),
    rows,
    rowTotal,
  }
}
