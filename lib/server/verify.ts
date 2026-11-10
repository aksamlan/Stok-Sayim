// E-posta doğrulama kodları (mağaza kurarken kötüye kullanımı önler).
// Sunucu tarafında durum TUTULMAZ: kod, HMAC imzalı bir jetonun içinde
// (hash olarak) taşınır; 15 dakika geçerlidir. Kod e-postayla kullanıcıya
// gider, jeton istemciye döner; ikisi birlikte sunulunca doğrulanır.

import { createHmac, randomInt, timingSafeEqual } from "node:crypto"
import type { DatabaseSync } from "node:sqlite"
import { getSecret } from "./auth"
import { getMeta, setMeta } from "./db"

const CODE_TTL_MS = 15 * 60 * 1000

function hmac(db: DatabaseSync, data: string): string {
  return createHmac("sha256", getSecret(db)).update(data).digest("base64url")
}

// Jeton imzası "verify:" ön ekiyle atılır: oturum tokenlarıyla aynı gizli
// anahtarı paylaşsa da iki tür birbirinin yerine ASLA geçemez (yapısal ayrım).
const signBody = (db: DatabaseSync, body: string) => hmac(db, `verify:${body}`)

// Kod hash'i e-posta + son kullanma anıyla tuzlanır: aynı kod iki jetonda
// farklı hash üretir, istemcinin elindeki jetonlardan sözlük kurulamaz.
const codeHash = (db: DatabaseSync, e: string, x: number, code: string) =>
  hmac(db, `code:${e}:${x}:${code.trim()}`)

export function createEmailCode(
  db: DatabaseSync,
  email: string,
  now = Date.now()
): { token: string; code: string } {
  const code = String(randomInt(100000, 1000000))
  const e = email.trim().toLowerCase()
  const x = now + CODE_TTL_MS
  const payload = { e, x, h: codeHash(db, e, x, code) }
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")
  return { token: `${body}.${signBody(db, body)}`, code }
}

export function verifyEmailCode(
  db: DatabaseSync,
  token: string,
  email: string,
  code: string,
  now = Date.now()
): boolean {
  const dot = token.lastIndexOf(".")
  if (dot < 0) return false
  const body = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expected = signBody(db, body)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
      e: string
      h: string
      x: number
    }
    if (typeof payload.x !== "number" || payload.x < now) return false
    if (payload.e !== email.trim().toLowerCase()) return false
    const expectedHash = codeHash(db, payload.e, payload.x, code)
    const c1 = Buffer.from(expectedHash)
    const c2 = Buffer.from(payload.h)
    return c1.length === c2.length && timingSafeEqual(c1, c2)
  } catch {
    return false
  }
}

// TEK KULLANIMLIK doğrulama: başarılı doğrulamada jeton imzası "kullanıldı"
// olarak işaretlenir; aynı kodla ikinci bir mağaza açılamaz.
export function consumeEmailCode(
  db: DatabaseSync,
  token: string,
  email: string,
  code: string,
  now = Date.now()
): boolean {
  if (!verifyEmailCode(db, token, email, code, now)) return false
  const sig = token.slice(token.lastIndexOf(".") + 1)
  const key = `usedcode:${sig}`
  if (getMeta(db, key) !== null) return false
  setMeta(db, key, String(now + CODE_TTL_MS))
  // Süresi geçmiş kayıtları fırsat buldukça temizle (tablo şişmesin)
  db.prepare(
    "DELETE FROM meta WHERE key LIKE 'usedcode:%' AND CAST(value AS INTEGER) < ?"
  ).run(now)
  return true
}

// Telefon: 10-15 hane (boşluk, tire, parantez, baştaki + ayıklanır).
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[\s\-().]/g, "").replace(/^\+/, "")
  if (!/^\d{10,15}$/.test(digits)) return null
  return digits
}
