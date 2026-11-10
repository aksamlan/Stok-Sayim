import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto"
import type { DatabaseSync } from "node:sqlite"
import { getMeta, setMeta } from "./db"

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export type TokenPayload = {
  storeId: string
  role: "counter" | "admin" | "super"
  counter: string
  exp: number
}

export function hashPassword(pw: string): string {
  const salt = randomBytes(16)
  const key = scryptSync(pw, salt, 32)
  return `${salt.toString("hex")}:${key.toString("hex")}`
}

export function verifyPassword(pw: string, hash: string): boolean {
  const [saltHex, keyHex] = hash.split(":")
  if (!saltHex || !keyHex) return false
  const expected = Buffer.from(keyHex, "hex")
  const actual = scryptSync(pw, Buffer.from(saltHex, "hex"), expected.length)
  return timingSafeEqual(actual, expected)
}

function getSecret(db: DatabaseSync): Buffer {
  let secret = getMeta(db, "secret")
  if (!secret) {
    secret = randomBytes(32).toString("hex")
    setMeta(db, "secret", secret)
  }
  return Buffer.from(secret, "hex")
}

function hmac(db: DatabaseSync, data: string): string {
  return createHmac("sha256", getSecret(db)).update(data).digest("base64url")
}

export function signToken(db: DatabaseSync, payload: TokenPayload): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")
  return `${body}.${hmac(db, body)}`
}

export function verifyToken(db: DatabaseSync, token: string): TokenPayload | null {
  const dot = token.lastIndexOf(".")
  if (dot < 0) return null
  const body = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expected = hmac(db, body)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8")
    ) as TokenPayload
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null
    if (
      payload.role !== "counter" &&
      payload.role !== "admin" &&
      payload.role !== "super"
    ) {
      return null
    }
    if (typeof payload.storeId !== "string") return null
    return payload
  } catch {
    return null
  }
}

export function requireAuth(
  db: DatabaseSync,
  req: Request,
  role?: "admin" | "super"
): TokenPayload {
  const header = req.headers.get("authorization") ?? ""
  const token = header.startsWith("Bearer ") ? header.slice(7) : ""
  const payload = token ? verifyToken(db, token) : null
  if (!payload) throw new ApiError(401, "Oturum geçersiz, tekrar giriş yap")
  if (role === "admin" && payload.role !== "admin") {
    throw new ApiError(403, "Bu işlem için yönetici girişi gerekli")
  }
  if (role === "super" && payload.role !== "super") {
    throw new ApiError(403, "Bu işlem için platform yöneticisi girişi gerekli")
  }
  return payload
}
