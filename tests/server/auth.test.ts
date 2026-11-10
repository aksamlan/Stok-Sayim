import { expect, test } from "vitest"
import {
  ApiError,
  hashPassword,
  requireAuth,
  signToken,
  verifyPassword,
  verifyToken,
  type TokenPayload,
} from "../../lib/server/auth"
import { openDatabase } from "../../lib/server/db"

const in30d = () => Date.now() + 30 * 24 * 3600 * 1000

test("password roundtrip", () => {
  const hash = hashPassword("gizli-şifre-123")
  expect(hash).not.toContain("gizli")
  expect(verifyPassword("gizli-şifre-123", hash)).toBe(true)
})

test("wrong password rejected", () => {
  const hash = hashPassword("doğru")
  expect(verifyPassword("yanlış", hash)).toBe(false)
})

test("token roundtrip", () => {
  const db = openDatabase(":memory:")
  const payload: TokenPayload = {
    storeId: "s1",
    role: "counter",
    counter: "Ayşe",
    exp: in30d(),
  }
  const token = signToken(db, payload)
  expect(verifyToken(db, token)).toEqual(payload)
})

test("tampered token rejected", () => {
  const db = openDatabase(":memory:")
  const token = signToken(db, {
    storeId: "s1",
    role: "counter",
    counter: "Ali",
    exp: in30d(),
  })
  const flipped = (token[0] === "A" ? "B" : "A") + token.slice(1)
  expect(verifyToken(db, flipped)).toBeNull()
})

test("expired token rejected", () => {
  const db = openDatabase(":memory:")
  const token = signToken(db, {
    storeId: "s1",
    role: "admin",
    counter: "",
    exp: Date.now() - 1000,
  })
  expect(verifyToken(db, token)).toBeNull()
})

test("requireAuth enforces admin role", () => {
  const db = openDatabase(":memory:")
  const token = signToken(db, {
    storeId: "s1",
    role: "counter",
    counter: "Ali",
    exp: in30d(),
  })
  const req = new Request("http://x/api", {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(requireAuth(db, req).storeId).toBe("s1")
  try {
    requireAuth(db, req, "admin")
    expect.unreachable("should have thrown")
  } catch (e) {
    expect(e).toBeInstanceOf(ApiError)
    expect((e as ApiError).status).toBe(403)
  }
})

test("requireAuth without header is 401", () => {
  const db = openDatabase(":memory:")
  try {
    requireAuth(db, new Request("http://x/api"))
    expect.unreachable("should have thrown")
  } catch (e) {
    expect((e as ApiError).status).toBe(401)
  }
})
