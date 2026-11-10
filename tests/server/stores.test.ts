import { expect, test } from "vitest"
import { ApiError, verifyToken } from "../../lib/server/auth"
import { openDatabase } from "../../lib/server/db"
import {
  closeSession,
  createSession,
  createStore,
  joinStore,
  listSessions,
} from "../../lib/server/stores"

function setup() {
  const db = openDatabase(":memory:")
  const { storeId, code } = createStore(db, "Şube 1", "say123", "admin123")
  return { db, storeId, code }
}

test("create store and join as counter", () => {
  const { db, storeId, code } = setup()
  expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/)
  const joined = joinStore(db, code, "say123", "Ayşe")
  expect(joined.role).toBe("counter")
  expect(joined.storeName).toBe("Şube 1")
  const payload = verifyToken(db, joined.token)
  expect(payload?.storeId).toBe(storeId)
  expect(payload?.counter).toBe("Ayşe")
})

test("admin password gives admin role", () => {
  const { db, code } = setup()
  const joined = joinStore(db, code, "admin123", "")
  expect(joined.role).toBe("admin")
})

test("wrong password is 401", () => {
  const { db, code } = setup()
  expect(() => joinStore(db, code, "yanlış", "Ali")).toThrowError(ApiError)
  try {
    joinStore(db, code, "yanlış", "Ali")
  } catch (e) {
    expect((e as ApiError).status).toBe(401)
  }
})

test("counter join requires a name", () => {
  const { db, code } = setup()
  try {
    joinStore(db, code, "say123", "  ")
    expect.unreachable()
  } catch (e) {
    expect((e as ApiError).status).toBe(400)
  }
})

test("only one active session per store", () => {
  const { db, storeId } = setup()
  const a = createSession(db, storeId, "Kasım Sayımı")
  const b = createSession(db, storeId, "Aralık Sayımı")
  const sessions = listSessions(db, storeId)
  expect(sessions.find((s) => s.id === a.id)?.status).toBe("closed")
  expect(sessions.find((s) => s.id === b.id)?.status).toBe("active")
  closeSession(db, storeId, b.id)
  expect(listSessions(db, storeId).every((s) => s.status === "closed")).toBe(true)
})

test("stores are isolated: unknown code is 401", () => {
  const { db } = setup()
  try {
    joinStore(db, "ZZZZZZ", "say123", "Ali")
    expect.unreachable()
  } catch (e) {
    expect((e as ApiError).status).toBe(401)
  }
})
