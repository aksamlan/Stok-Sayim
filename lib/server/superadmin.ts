import type { DatabaseSync } from "node:sqlite"
import {
  ApiError,
  hashPassword,
  signToken,
  verifyPassword,
} from "./auth"
import { getMeta, setMeta } from "./db"

const SUPER_TOKEN_TTL_MS = 24 * 3600 * 1000

export function setSuperPassword(db: DatabaseSync, password: string): void {
  if (password.length < 6) {
    throw new ApiError(400, "Platform yöneticisi şifresi en az 6 karakter olmalı")
  }
  setMeta(db, "sa_pw_hash", hashPassword(password))
}

export function superLogin(db: DatabaseSync, password: string): { token: string } {
  const hash = getMeta(db, "sa_pw_hash")
  if (!hash) {
    throw new ApiError(
      503,
      "Yönetici şifresi henüz belirlenmemiş. Sunucuda şunu çalıştır: node scripts/yonetici-sifre.mjs <şifre>"
    )
  }
  if (!verifyPassword(password, hash)) {
    throw new ApiError(401, "Şifre hatalı")
  }
  const token = signToken(db, {
    storeId: "",
    role: "super",
    counter: "",
    exp: Date.now() + SUPER_TOKEN_TTL_MS,
  })
  return { token }
}

export type StoreOverview = {
  id: string
  code: string
  name: string
  createdAt: number
  catalogCount: number
  sessionCount: number
  counterCount: number
  eventCount: number
  totalQty: number
  lastActivity: number | null
}

export function overview(db: DatabaseSync): {
  stores: StoreOverview[]
  recent: { storeName: string; counter: string; qty: number; at: number }[]
} {
  const stores = db
    .prepare(
      `SELECT s.id, s.code, s.name, s.created_at AS createdAt,
        (SELECT COUNT(*) FROM products p WHERE p.store_id = s.id) AS catalogCount,
        (SELECT COUNT(*) FROM sessions x WHERE x.store_id = s.id) AS sessionCount,
        (SELECT COUNT(DISTINCT counter) FROM scan_events e WHERE e.store_id = s.id) AS counterCount,
        (SELECT COUNT(*) FROM scan_events e WHERE e.store_id = s.id) AS eventCount,
        (SELECT COALESCE(SUM(qty), 0) FROM scan_events e WHERE e.store_id = s.id) AS totalQty,
        (SELECT MAX(received_at) FROM scan_events e WHERE e.store_id = s.id) AS lastActivity
       FROM stores s ORDER BY s.created_at DESC`
    )
    .all() as StoreOverview[]

  const recent = db
    .prepare(
      `SELECT st.name AS storeName, e.counter AS counter, e.qty AS qty, e.received_at AS at
       FROM scan_events e JOIN stores st ON st.id = e.store_id
       ORDER BY e.received_at DESC LIMIT 50`
    )
    .all() as { storeName: string; counter: string; qty: number; at: number }[]

  return { stores, recent }
}

export function resetStorePassword(
  db: DatabaseSync,
  storeId: string,
  which: "count" | "admin",
  newPassword: string
): void {
  if (newPassword.length < 4) {
    throw new ApiError(400, "Şifre en az 4 karakter olmalı")
  }
  const column = which === "admin" ? "admin_pw_hash" : "count_pw_hash"
  const result = db
    .prepare(`UPDATE stores SET ${column} = ? WHERE id = ?`)
    .run(hashPassword(newPassword), storeId)
  if (Number(result.changes) === 0) throw new ApiError(404, "Mağaza bulunamadı")
}

export function deleteStore(db: DatabaseSync, storeId: string): void {
  db.exec("BEGIN")
  try {
    db.prepare("DELETE FROM scan_events WHERE store_id = ?").run(storeId)
    db.prepare("DELETE FROM products WHERE store_id = ?").run(storeId)
    db.prepare("DELETE FROM sessions WHERE store_id = ?").run(storeId)
    const r = db.prepare("DELETE FROM stores WHERE id = ?").run(storeId)
    if (Number(r.changes) === 0) throw new ApiError(404, "Mağaza bulunamadı")
    db.exec("COMMIT")
  } catch (e) {
    db.exec("ROLLBACK")
    throw e
  }
}
