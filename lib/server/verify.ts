// E-posta doğrulama kodları (mağaza kurarken kötüye kullanımı önler).
// Sunucu tarafında durum TUTULMAZ: kod, HMAC imzalı bir jetonun içinde
// (hash olarak) taşınır; 15 dakika geçerlidir. Kod e-postayla kullanıcıya
// gider, jeton istemciye döner; ikisi birlikte sunulunca doğrulanır.

import { createHmac, randomInt, timingSafeEqual } from "node:crypto"
import type { DatabaseSync } from "node:sqlite"
import { getSecret } from "./auth"

const CODE_TTL_MS = 15 * 60 * 1000

function hmac(db: DatabaseSync, data: string): string {
  return createHmac("sha256", getSecret(db)).update(data).digest("base64url")
}

export function createEmailCode(
  db: DatabaseSync,
  email: string,
  now = Date.now()
): { token: string; code: string } {
  const code = String(randomInt(100000, 1000000))
  const payload = {
    e: email.trim().toLowerCase(),
    h: hmac(db, `code:${code}`),
    x: now + CODE_TTL_MS,
  }
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")
  return { token: `${body}.${hmac(db, body)}`, code }
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
  const expected = hmac(db, body)
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
    const codeHash = hmac(db, `code:${code.trim()}`)
    const c1 = Buffer.from(codeHash)
    const c2 = Buffer.from(payload.h)
    return c1.length === c2.length && timingSafeEqual(c1, c2)
  } catch {
    return false
  }
}

// Telefon: 10-15 hane (boşluk, tire, parantez, baştaki + ayıklanır).
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[\s\-().]/g, "").replace(/^\+/, "")
  if (!/^\d{10,15}$/.test(digits)) return null
  return digits
}
