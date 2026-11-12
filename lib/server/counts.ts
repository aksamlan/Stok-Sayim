import type { DatabaseSync } from "node:sqlite"
import { ApiError } from "./auth"

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
  serverNow: number
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
  if (events.length > 1000) {
    throw new ApiError(400, "Tek istekte en fazla 1000 okutma gönderilebilir")
  }
  const sessionId = events[0].sessionId
  for (const e of events) {
    if (
      typeof e.id !== "string" ||
      !e.id ||
      e.sessionId !== sessionId ||
      typeof e.barcode !== "string" ||
      !e.barcode ||
      !Number.isInteger(e.qty) ||
      typeof e.createdAt !== "number" ||
      !Number.isFinite(e.createdAt)
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

// Ağır birleşim (products × olay toplamları) istek başına TEK kez çalışır:
// sonuç geçici tabloya yazılır; satırlar, sayfa toplamı, kategori kırılımı ve
// özet rakamlar oradan okunur. DatabaseSync senkron olduğu için istekler
// arasında temp tablo çakışması olmaz.
const ROWS_CTE = `
WITH agg AS (
  SELECT barcode, SUM(qty) AS counted, MAX(received_at) AS last_at
  FROM scan_events
  WHERE store_id = ? AND session_id = ?
  GROUP BY barcode
),
all_rows AS (
  SELECT p.barcode AS barcode, p.name AS name, p.category AS category,
         p.expected_qty AS expected, COALESCE(a.counted, 0) AS counted,
         1 AS in_catalog, a.last_at AS last_at
  FROM products p LEFT JOIN agg a ON a.barcode = p.barcode
  WHERE p.store_id = ?
  UNION ALL
  SELECT a.barcode, NULL, NULL, NULL, a.counted, 0, a.last_at
  FROM agg a
  WHERE a.counted <> 0
    AND NOT EXISTS (SELECT 1 FROM products p WHERE p.store_id = ? AND p.barcode = a.barcode)
),
statused AS (
  SELECT barcode, name, category, expected, counted, last_at,
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
    where.push("(barcode LIKE ? OR tr_lower(name) LIKE ?)")
    whereParams.push(
      `%${opts.search.trim()}%`,
      `%${opts.search.trim().toLocaleLowerCase("tr")}%`
    )
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : ""
  const cteParams = [storeId, sessionId, storeId, storeId]

  db.exec("DROP TABLE IF EXISTS temp.dash_rows")
  db.prepare(
    `CREATE TEMP TABLE dash_rows AS ${ROWS_CTE} SELECT * FROM statused`
  ).run(...cteParams)
  try {
    const rows = db
      .prepare(
        `SELECT barcode, name, category, expected, counted, status FROM temp.dash_rows ${whereSql}
         ORDER BY (counted <> 0) DESC, last_at DESC, (status = 'only-count') DESC,
                  category IS NULL, category, barcode
         LIMIT ? OFFSET ?`
      )
      .all(...whereParams, pageSize, (page - 1) * pageSize) as DashboardRow[]

    const rowTotal = (
      db
        .prepare(`SELECT COUNT(*) AS n FROM temp.dash_rows ${whereSql}`)
        .get(...whereParams) as { n: number }
    ).n

    const totalsRow = db
      .prepare(
        `SELECT COALESCE(SUM(counted), 0) AS totalQty,
           COALESCE(SUM(counted <> 0 AND status <> 'only-count'), 0) AS distinctCounted,
           COALESCE(SUM(status = 'only-count'), 0) AS unknownCount,
           COALESCE(SUM(status <> 'only-count'), 0) AS catalogCount
         FROM temp.dash_rows`
      )
      .get() as {
      totalQty: number
      distinctCounted: number
      unknownCount: number
      catalogCount: number
    }

    const countersRow = db
      .prepare(
        "SELECT COUNT(DISTINCT counter) AS n FROM scan_events WHERE store_id = ? AND session_id = ?"
      )
      .get(storeId, sessionId) as { n: number }

    // Çeşit = net adedi 0'dan büyük barkodlar (bir ürün silinince/azaltılınca
    // adet gibi çeşit sayısı da düşer). Son okutma SUNUCU saatiyle (received_at):
    // telefon saati yanlış olsa bile "1 saat önce" gibi hatalı görünmez.
    const byCounter = db
      .prepare(
        `SELECT counter, COALESCE(SUM(q), 0) AS qty, COALESCE(SUM(q > 0), 0) AS distinct_n,
                MAX(last_at) AS lastAt
         FROM (
           SELECT counter, barcode, SUM(qty) AS q, MAX(received_at) AS last_at
           FROM scan_events WHERE store_id = ? AND session_id = ?
           GROUP BY counter, barcode
         ) GROUP BY counter ORDER BY qty DESC`
      )
      .all(storeId, sessionId) as {
      counter: string
      qty: number
      distinct_n: number
      lastAt: number
    }[]

    const byCategory = db
      .prepare(
        `SELECT category, COALESCE(SUM(counted), 0) AS counted,
           COALESCE(SUM(expected), 0) AS expected,
           SUM(counted <> 0) AS distinct_n
         FROM temp.dash_rows GROUP BY category
         ORDER BY category IS NULL, category`
      )
      .all() as {
      category: string | null
      counted: number
      expected: number
      distinct_n: number
    }[]

    return buildResult(totalsRow, countersRow.n, byCounter, byCategory, rows, rowTotal)
  } finally {
    db.exec("DROP TABLE IF EXISTS temp.dash_rows")
  }
}

function buildResult(
  totals: {
    totalQty: number
    distinctCounted: number
    unknownCount: number
    catalogCount: number
  },
  counters: number,
  byCounter: { counter: string; qty: number; distinct_n: number; lastAt: number }[],
  byCategory: {
    category: string | null
    counted: number
    expected: number
    distinct_n: number
  }[],
  rows: DashboardRow[],
  rowTotal: number
): DashboardResult {
  return {
    totals: {
      totalQty: totals.totalQty,
      distinctCounted: totals.distinctCounted,
      counters,
      unknownCount: totals.unknownCount,
      catalogCount: totals.catalogCount,
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
    serverNow: Date.now(),
  }
}

// Yönetici: seçilen sayımcının bu sayımda neyi ne kadar saydığı (net adet > 0).
// En son okutulan üstte. idx_events_counter ile (mağaza, sayım, sayımcı) indeksli.
export type CounterDetailRow = {
  barcode: string
  name: string | null
  category: string | null
  qty: number
  lastAt: number
}

export function counterDetail(
  db: DatabaseSync,
  storeId: string,
  sessionId: string,
  counter: string,
  opts: { search?: string; limit?: number } = {}
): { rows: CounterDetailRow[]; total: number; totalQty: number } {
  const limit = Math.min(Math.max(1, Math.floor(opts.limit ?? 100)), 1000)
  const search = opts.search?.trim()
  const filter = search ? "WHERE (g.barcode LIKE ? OR tr_lower(p.name) LIKE ?)" : ""
  const filterParams = search ? [`%${search}%`, `%${search.toLocaleLowerCase("tr")}%`] : []
  const base = `
    FROM (
      SELECT barcode, SUM(qty) AS qty, MAX(received_at) AS last_at
      FROM scan_events WHERE store_id = ? AND session_id = ? AND counter = ?
      GROUP BY barcode HAVING SUM(qty) > 0
    ) g
    LEFT JOIN products p ON p.store_id = ? AND p.barcode = g.barcode
    ${filter}`
  const params = [storeId, sessionId, counter, storeId, ...filterParams]
  const rows = db
    .prepare(
      `SELECT g.barcode AS barcode, p.name AS name, p.category AS category,
              g.qty AS qty, g.last_at AS lastAt
       ${base} ORDER BY g.last_at DESC, g.barcode LIMIT ?`
    )
    .all(...params, limit) as CounterDetailRow[]
  const agg = db
    .prepare(`SELECT COUNT(*) AS total, COALESCE(SUM(g.qty), 0) AS totalQty ${base}`)
    .get(...params) as { total: number; totalQty: number }
  return { rows, total: agg.total, totalQty: agg.totalQty }
}
