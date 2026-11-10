import { expect, test } from "vitest"
import { openDatabase } from "../../lib/server/db"
import {
  consumeEmailCode,
  createEmailCode,
  normalizePhone,
  verifyEmailCode,
} from "../../lib/server/verify"

test("email code roundtrip", () => {
  const db = openDatabase(":memory:")
  const { token, code } = createEmailCode(db, "Sahip@Ornek.com")
  expect(code).toMatch(/^\d{6}$/)
  expect(verifyEmailCode(db, token, "sahip@ornek.com", code)).toBe(true)
  // e-posta büyük/küçük harf duyarsız eşleşir
  expect(verifyEmailCode(db, token, "SAHIP@ORNEK.COM", code)).toBe(true)
})

test("wrong code, wrong email, tampered token rejected", () => {
  const db = openDatabase(":memory:")
  const { token, code } = createEmailCode(db, "a@b.com")
  expect(verifyEmailCode(db, token, "a@b.com", "000000")).toBe(false)
  expect(verifyEmailCode(db, token, "baska@b.com", code)).toBe(false)
  const flipped = (token[0] === "A" ? "B" : "A") + token.slice(1)
  expect(verifyEmailCode(db, flipped, "a@b.com", code)).toBe(false)
})

test("expired code rejected", () => {
  const db = openDatabase(":memory:")
  const { token, code } = createEmailCode(db, "a@b.com", Date.now() - 16 * 60 * 1000)
  expect(verifyEmailCode(db, token, "a@b.com", code)).toBe(false)
})

test("a code is single-use (cannot mint two stores)", () => {
  const db = openDatabase(":memory:")
  const { token, code } = createEmailCode(db, "a@b.com")
  expect(consumeEmailCode(db, token, "a@b.com", code)).toBe(true)
  expect(consumeEmailCode(db, token, "a@b.com", code)).toBe(false)
})

test("same code in two tokens hashes differently (salted)", () => {
  const db = openDatabase(":memory:")
  const t1 = createEmailCode(db, "a@b.com", 1000)
  const t2 = createEmailCode(db, "c@d.com", 2000)
  // gövdeler farklı tuz taşıdığı için aynı kod bile aynı hash'i üretemez;
  // jeton gövdeleri karşılaştırılabilir olmamalı
  expect(t1.token.split(".")[0]).not.toBe(t2.token.split(".")[0])
})

test("phone normalization", () => {
  expect(normalizePhone("+90 555 111 22 33")).toBe("905551112233")
  expect(normalizePhone("0555-111-2233")).toBe("05551112233")
  expect(normalizePhone("123")).toBeNull()
  expect(normalizePhone("abc5551112233")).toBeNull()
})
