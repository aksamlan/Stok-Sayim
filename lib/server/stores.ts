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
  adminPassword: string,
  email?: string,
  phone?: string
): { storeId: string; code: string } {
  if (!name.trim()) throw new ApiError(400, "Mağaza adı gerekli")
  if (countPassword.length < 4 || adminPassword.length < 4) {
    throw new ApiError(400, "Şifreler en az 4 karakter olmalı")
  }
  const cleanEmail = email?.trim() || null
  if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new ApiError(400, "Geçerli bir e-posta adresi gir")
  }
  const storeId = randomUUID()
  const insert = db.prepare(
    "INSERT INTO stores (id, code, name, count_pw_hash, admin_pw_hash, email, phone, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
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
        cleanEmail,
        phone?.trim() || null,
        Date.now()
      )
      return { storeId, code }
    } catch (e) {
      // Yalnız kod çakışmasında yeni kod dene; başka hatayı (disk dolu vb.)
      // 10 kez tekrarlamak gerçek nedeni gizler.
      const isCollision = e instanceof Error && /UNIQUE/i.test(e.message)
      if (!isCollision || attempt === 9) throw e
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
  token_version: number
}

export function joinStore(
  db: DatabaseSync,
  code: string,
  password: string,
  counterName: string,
  pin: string
): { token: string; role: "counter" | "admin"; storeId: string; storeName: string } {
  const row = db
    .prepare("SELECT * FROM stores WHERE code = ?")
    .get(code.trim().toUpperCase()) as StoreRow | undefined
  if (!row) throw new ApiError(401, "Kod veya şifre hatalı")
  const exp = Date.now() + TOKEN_TTL_MS
  // Giriş aktivitedir: temizlik sayacı sıfırlanır (uyarı maili "giriş yapman
  // yeterli" diyor — bu söz burada tutuluyor).
  const markSeen = () => {
    db.prepare("UPDATE stores SET last_seen_at = ? WHERE id = ?").run(Date.now(), row.id)
  }
  if (verifyPassword(password, row.admin_pw_hash)) {
    markSeen()
    const token = signToken(db, {
      storeId: row.id,
      role: "admin",
      counter: "",
      exp,
      tv: row.token_version,
    })
    return { token, role: "admin", storeId: row.id, storeName: row.name }
  }
  if (verifyPassword(password, row.count_pw_hash)) {
    const counter = counterName.trim()
    if (!counter) throw new ApiError(400, "Adını yazman gerekli")
    if (pin.trim().length < 4) {
      throw new ApiError(400, "PIN en az 4 haneli olmalı")
    }
    // PIN ismi korur: ilk giren PIN'ini kaydeder, aynı ismi yanlış PIN'le
    // giren başka biri reddedilir — iki kişinin sayımı asla birbirine karışmaz.
    const existing = db
      .prepare("SELECT pin_hash, created_at FROM counters WHERE store_id = ? AND name = ?")
      .get(row.id, counter) as { pin_hash: string; created_at: number } | undefined
    let generation: number
    if (existing) {
      if (!verifyPassword(pin.trim(), existing.pin_hash)) {
        throw new ApiError(
          401,
          "Bu isim kayıtlı ama PIN yanlış. PIN'ini doğru gir ya da farklı bir isim seç."
        )
      }
      generation = existing.created_at
    } else {
      generation = Date.now()
      db.prepare(
        "INSERT INTO counters (store_id, name, pin_hash, created_at) VALUES (?, ?, ?, ?)"
      ).run(row.id, counter, hashPassword(pin.trim()), generation)
    }
    markSeen()
    const token = signToken(db, {
      storeId: row.id,
      role: "counter",
      counter,
      exp,
      tv: row.token_version,
      cg: generation,
    })
    return { token, role: "counter", storeId: row.id, storeName: row.name }
  }
  throw new ApiError(401, "Kod veya şifre hatalı")
}

// Yönetici, PIN'ini unutan sayımcının kaydını siler; isim yeni PIN'le yeniden
// alınır. Eski cihazdaki token da düşer (cg eşleşmez) — isim çalınamaz.
export function resetCounterPin(db: DatabaseSync, storeId: string, name: string): void {
  db.prepare("DELETE FROM counters WHERE store_id = ? AND name = ?").run(storeId, name)
}

// Kayıtlı sayımcı adları (hiç okutma yapmamışlar dahil) — PIN yönetimi için.
export function listCounters(
  db: DatabaseSync,
  storeId: string
): { name: string; createdAt: number }[] {
  return (
    db
      .prepare(
        "SELECT name, created_at AS createdAt FROM counters WHERE store_id = ? ORDER BY name"
      )
      .all(storeId) as { name: string; createdAt: number }[]
  )
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
