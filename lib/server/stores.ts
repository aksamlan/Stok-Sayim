import { randomBytes, randomUUID } from "node:crypto"
import type { DatabaseSync } from "node:sqlite"
import {
  ApiError,
  hashPassword,
  signToken,
  verifyPassword,
} from "./auth"

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
const TOKEN_TTL_MS = 30 * 24 * 3600 * 1000

function randomCode(): string {
  const bytes = randomBytes(6)
  let code = ""
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]
  return code
}

export function createStore(
  db: DatabaseSync,
  name: string,
  countPassword: string,
  adminPassword: string
): { storeId: string; code: string } {
  if (!name.trim()) throw new ApiError(400, "Mağaza adı gerekli")
  if (countPassword.length < 4 || adminPassword.length < 4) {
    throw new ApiError(400, "Şifreler en az 4 karakter olmalı")
  }
  const storeId = randomUUID()
  const insert = db.prepare(
    "INSERT INTO stores (id, code, name, count_pw_hash, admin_pw_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  )
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomCode()
    try {
      insert.run(
        storeId,
        code,
        name.trim(),
        hashPassword(countPassword),
        hashPassword(adminPassword),
        Date.now()
      )
      return { storeId, code }
    } catch (e) {
      if (attempt === 9) throw e
    }
  }
  throw new ApiError(500, "Mağaza kodu üretilemedi")
}

type StoreRow = {
  id: string
  code: string
  name: string
  count_pw_hash: string
  admin_pw_hash: string
}

export function joinStore(
  db: DatabaseSync,
  code: string,
  password: string,
  counterName: string
): { token: string; role: "counter" | "admin"; storeId: string; storeName: string } {
  const row = db
    .prepare("SELECT * FROM stores WHERE code = ?")
    .get(code.trim().toUpperCase()) as StoreRow | undefined
  if (!row) throw new ApiError(401, "Kod veya şifre hatalı")
  const exp = Date.now() + TOKEN_TTL_MS
  if (verifyPassword(password, row.admin_pw_hash)) {
    const token = signToken(db, { storeId: row.id, role: "admin", counter: "", exp })
    return { token, role: "admin", storeId: row.id, storeName: row.name }
  }
  if (verifyPassword(password, row.count_pw_hash)) {
    const counter = counterName.trim()
    if (!counter) throw new ApiError(400, "Adını yazman gerekli")
    const token = signToken(db, { storeId: row.id, role: "counter", counter, exp })
    return { token, role: "counter", storeId: row.id, storeName: row.name }
  }
  throw new ApiError(401, "Kod veya şifre hatalı")
}

export type SessionInfo = {
  id: string
  name: string
  status: "active" | "closed"
  createdAt: number
}

export function createSession(
  db: DatabaseSync,
  storeId: string,
  name: string
): { id: string } {
  if (!name.trim()) throw new ApiError(400, "Sayım adı gerekli")
  const id = randomUUID()
  db.prepare("UPDATE sessions SET status = 'closed' WHERE store_id = ? AND status = 'active'").run(storeId)
  db.prepare(
    "INSERT INTO sessions (id, store_id, name, status, created_at) VALUES (?, ?, ?, 'active', ?)"
  ).run(id, storeId, name.trim(), Date.now())
  return { id }
}

export function listSessions(db: DatabaseSync, storeId: string): SessionInfo[] {
  const rows = db
    .prepare(
      "SELECT id, name, status, created_at FROM sessions WHERE store_id = ? ORDER BY created_at DESC"
    )
    .all(storeId) as { id: string; name: string; status: string; created_at: number }[]
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status as "active" | "closed",
    createdAt: r.created_at,
  }))
}

export function closeSession(db: DatabaseSync, storeId: string, sessionId: string): void {
  db.prepare("UPDATE sessions SET status = 'closed' WHERE store_id = ? AND id = ?").run(
    storeId,
    sessionId
  )
}
