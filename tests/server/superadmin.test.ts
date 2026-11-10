import { expect, test } from "vitest"
import { ApiError, requireAuth, verifyToken } from "../../lib/server/auth"
import { recordEvents } from "../../lib/server/counts"
import { openDatabase } from "../../lib/server/db"
import { checkRateLimit } from "../../lib/server/ratelimit"
import { createSession, createStore, joinStore } from "../../lib/server/stores"
import {
  deleteStore,
  overview,
  resetStorePassword,
  setSuperPassword,
  superLogin,
} from "../../lib/server/superadmin"

test("super login before password set is 503", () => {
  const db = openDatabase(":memory:")
  try {
    superLogin(db, "x")
    expect.unreachable()
  } catch (e) {
    expect((e as ApiError).status).toBe(503)
  }
})

test("super login roundtrip and role", () => {
  const db = openDatabase(":memory:")
  setSuperPassword(db, "çok-gizli")
  try {
    superLogin(db, "yanlış")
    expect.unreachable()
  } catch (e) {
    expect((e as ApiError).status).toBe(401)
  }
  const { token } = superLogin(db, "çok-gizli")
  expect(verifyToken(db, token)?.role).toBe("super")
})

test("counter token rejected for super endpoints", () => {
  const db = openDatabase(":memory:")
  const { code } = createStore(db, "Şube", "say123", "admin123")
  const { token } = joinStore(db, code, "say123", "Ali", "1111")
  const req = new Request("http://x", {
    headers: { Authorization: `Bearer ${token}` },
  })
  try {
    requireAuth(db, req, "super")
    expect.unreachable()
  } catch (e) {
    expect((e as ApiError).status).toBe(403)
  }
})

test("reset store password: old stops working, new works", () => {
  const db = openDatabase(":memory:")
  const { storeId, code } = createStore(db, "Şube", "say123", "admin123")
  resetStorePassword(db, storeId, "count", "yeni456")
  try {
    joinStore(db, code, "say123", "Ali", "1111")
    expect.unreachable()
  } catch (e) {
    expect((e as ApiError).status).toBe(401)
  }
  expect(joinStore(db, code, "yeni456", "Ali", "1111").role).toBe("counter")
  resetStorePassword(db, storeId, "admin", "patron789")
  expect(joinStore(db, code, "patron789", "", "").role).toBe("admin")
})

test("overview aggregates and delete cascades", () => {
  const db = openDatabase(":memory:")
  const { storeId, code } = createStore(db, "Şube 1", "say123", "admin123")
  createStore(db, "Şube 2", "say123", "admin123")
  const { id: sessionId } = createSession(db, storeId, "Sayım")
  recordEvents(db, storeId, "Ali", [
    { id: "e1", sessionId, barcode: "869", qty: 3, createdAt: Date.now() },
  ])
  const o = overview(db)
  expect(o.stores).toHaveLength(2)
  const s1 = o.stores.find((s) => s.code === code)
  expect(s1?.eventCount).toBe(1)
  expect(s1?.totalQty).toBe(3)
  expect(s1?.counterCount).toBe(1)
  expect(o.recent).toHaveLength(1)
  expect(o.recent[0].counter).toBe("Ali")

  deleteStore(db, storeId)
  const after = overview(db)
  expect(after.stores).toHaveLength(1)
  expect(after.recent).toHaveLength(0)
})

test("rate limit blocks after limit in window", () => {
  for (let i = 0; i < 10; i++) {
    expect(checkRateLimit("test-key", 10, 60000)).toBe(true)
  }
  expect(checkRateLimit("test-key", 10, 60000)).toBe(false)
  expect(checkRateLimit("other-key", 10, 60000)).toBe(true)
})
