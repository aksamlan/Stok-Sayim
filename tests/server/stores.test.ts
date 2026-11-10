import { expect, test } from "vitest"
import { ApiError, verifyToken } from "../../lib/server/auth"
import { openDatabase } from "../../lib/server/db"
import {
  closeSession,
  createSession,
  createStore,
  joinStore,
  listCounterNamesForJoin,
  listSessions,
  resetCounterPin,
} from "../../lib/server/stores"

function setup() {
  const db = openDatabase(":memory:")
  const { storeId, code } = createStore(db, "Şube 1", "say123", "admin123")
  return { db, storeId, code }
}

test("create store and join as counter", () => {
  const { db, storeId, code } = setup()
  expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/)
  const joined = joinStore(db, code, "say123", "Ayşe", "1111")
  expect(joined.role).toBe("counter")
  expect(joined.storeName).toBe("Şube 1")
  const payload = verifyToken(db, joined.token)
  expect(payload?.storeId).toBe(storeId)
  expect(payload?.counter).toBe("Ayşe")
})

test("admin password gives admin role", () => {
  const { db, code } = setup()
  const joined = joinStore(db, code, "admin123", "", "")
  expect(joined.role).toBe("admin")
})

test("wrong password is 401", () => {
  const { db, code } = setup()
  expect(() => joinStore(db, code, "yanlış", "Ali", "1111")).toThrowError(ApiError)
  try {
    joinStore(db, code, "yanlış", "Ali", "1111")
  } catch (e) {
    expect((e as ApiError).status).toBe(401)
  }
})

test("counter join requires a name", () => {
  const { db, code } = setup()
  try {
    joinStore(db, code, "say123", "  ", "1111")
    expect.unreachable()
  } catch (e) {
    expect((e as ApiError).status).toBe(400)
  }
})

test("counter PIN protects the name", () => {
  const { db, code } = setup()
  // ilk giriş PIN'i kaydeder
  expect(joinStore(db, code, "say123", "Ayşe", "1111").role).toBe("counter")
  // aynı isim + doğru PIN tekrar girebilir
  expect(joinStore(db, code, "say123", "Ayşe", "1111").role).toBe("counter")
  // aynı isim + yanlış PIN reddedilir (isim çakışması birleşmez)
  try {
    joinStore(db, code, "say123", "Ayşe", "2222")
    expect.unreachable()
  } catch (e) {
    expect((e as ApiError).status).toBe(401)
  }
  // PIN çok kısa → 400
  try {
    joinStore(db, code, "say123", "Yeni", "12")
    expect.unreachable()
  } catch (e) {
    expect((e as ApiError).status).toBe(400)
  }
})

test("admin can reset a counter PIN", () => {
  const { db, storeId, code } = setup()
  joinStore(db, code, "say123", "Ayşe", "1111")
  resetCounterPin(db, storeId, "Ayşe")
  // PIN silindi: isim yeni PIN'le yeniden kaydedilir
  expect(joinStore(db, code, "say123", "Ayşe", "9999").role).toBe("counter")
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
    joinStore(db, "ZZZZZZ", "say123", "Ali", "1111")
    expect.unreachable()
  } catch (e) {
    expect((e as ApiError).status).toBe(401)
  }
})

test("PIN'siz giriş: aynı ad (büyük/küçük harf, boşluk fark etmez) aynı sayımcıdır", () => {
  const { db, code } = setup()
  const a = joinStore(db, code, "say123", "Ayşe", "")
  const b = joinStore(db, code, "say123", "  ayşe ", "")
  const c = joinStore(db, code, "say123", "AYŞE", "")
  expect(a.counter).toBe("Ayşe")
  expect(b.counter).toBe("Ayşe") // kayıtlı yazım korunur
  expect(c.counter).toBe("Ayşe")
  expect(verifyToken(db, b.token)?.cg).toBe(verifyToken(db, a.token)?.cg)
  expect(listCounterNamesForJoin(db, code, "say123")).toEqual([{ name: "Ayşe", hasPin: false }])
  // Türkçe İ/ı: "ISIK" ≠ "ışık" değil, tr-locale ile eşleşmeli
  joinStore(db, code, "say123", "Işık", "")
  expect(joinStore(db, code, "say123", "ışık", "").counter).toBe("Işık")
  expect(listCounterNamesForJoin(db, code, "say123")).toHaveLength(2)
})

test("PIN'li ad PIN'siz alınamaz; ad listesi yanlış şifreyle verilmez", () => {
  const { db, code } = setup()
  joinStore(db, code, "say123", "Mehmet", "4321")
  try {
    joinStore(db, code, "say123", "mehmet", "")
    expect.unreachable()
  } catch (e) {
    expect((e as ApiError).status).toBe(401)
  }
  expect(joinStore(db, code, "say123", "mehmet", "4321").counter).toBe("Mehmet")
  expect(listCounterNamesForJoin(db, code, "say123")).toEqual([{ name: "Mehmet", hasPin: true }])
  expect(() => listCounterNamesForJoin(db, code, "yanlis")).toThrow()
})
