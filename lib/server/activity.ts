// Hareket günlüğü: "kim, ne zaman, ne yaptı". Okutmalar scan_events'ten, diğer
// işlemler (giriş, sayım başlat/bitir, liste yükleme, sıfırlama...) activity_log'dan
// okunur; ikisi tek zaman çizelgesinde birleşir. Hepsi indeksli (store_id, zaman).
import type { DatabaseSync } from "node:sqlite"

export type ActivityEntry = {
  at: number
  actor: string
  action: string // "scan" | "login" | "session_start" | ...
  barcode: string | null
  qty: number | null
  name: string | null
  detail: string | null
}

const RETENTION_MS = 90 * 24 * 60 * 60 * 1000 // günlük 90 gün tutulur

// Günlük asla asıl işlemi bozmamalı: hata yutulur.
export function logActivity(
  db: DatabaseSync,
  storeId: string,
  actor: string,
  action: string,
  detail?: string | null
): void {
  try {
    db.prepare(
      "INSERT INTO activity_log (store_id, at, actor, action, detail) VALUES (?, ?, ?, ?, ?)"
    ).run(storeId, Date.now(), actor || "Yönetici", action, detail ?? null)
  } catch (e) {
    console.error("[activity]", e instanceof Error ? e.message : e)
  }
}

export function pruneActivity(db: DatabaseSync, now = Date.now()): number {
  return Number(
    db.prepare("DELETE FROM activity_log WHERE at < ?").run(now - RETENTION_MS).changes
  )
}

export function listActivity(
  db: DatabaseSync,
  storeId: string,
  opts: { sessionId?: string; actor?: string; limit?: number }
): ActivityEntry[] {
  const limit = Math.min(Math.max(1, Math.floor(opts.limit ?? 50)), 500)
  const scanWhere = ["e.store_id = ?"]
  const scanParams: (string | number)[] = [storeId]
  const logWhere = ["store_id = ?"]
  const logParams: (string | number)[] = [storeId]
  if (opts.sessionId) {
    scanWhere.push("e.session_id = ?")
    scanParams.push(opts.sessionId)
  }
  if (opts.actor) {
    scanWhere.push("e.counter = ?")
    scanParams.push(opts.actor)
    logWhere.push("actor = ?")
    logParams.push(opts.actor)
  }
  return db
    .prepare(
      `SELECT * FROM (
         SELECT at, actor, action, barcode, qty, name, detail FROM (
           SELECT e.received_at AS at, e.counter AS actor, 'scan' AS action,
                  e.barcode AS barcode, e.qty AS qty, p.name AS name, NULL AS detail
           FROM scan_events e
           LEFT JOIN products p ON p.store_id = e.store_id AND p.barcode = e.barcode
           WHERE ${scanWhere.join(" AND ")}
           ORDER BY e.received_at DESC, e.rowid DESC LIMIT ?
         )
         UNION ALL
         SELECT at, actor, action, NULL, NULL, NULL, detail FROM (
           SELECT at, actor, action, detail FROM activity_log
           WHERE ${logWhere.join(" AND ")}
           ORDER BY at DESC, id DESC LIMIT ?
         )
       ) ORDER BY at DESC LIMIT ?`
    )
    .all(...scanParams, limit, ...logParams, limit, limit) as ActivityEntry[]
}
