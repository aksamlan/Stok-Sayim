import { expect, test } from "vitest"
import {
  getCatalog,
  replaceCatalog,
  type CatalogItem,
} from "../../lib/server/catalog"
import { openDatabase } from "../../lib/server/db"
import { createStore } from "../../lib/server/stores"

function setup() {
  const db = openDatabase(":memory:")
  const { storeId } = createStore(db, "Şube", "say123", "admin123")
  return { db, storeId }
}

test("replace and get catalog", () => {
  const { db, storeId } = setup()
  const items: CatalogItem[] = [
    { barcode: "8690123456789", name: "Süt 1L", category: "Kahvaltılık", expected: 24 },
    { barcode: "8691234567890", name: "Ekmek", category: null, expected: null },
  ]
  const r1 = replaceCatalog(db, storeId, items)
  expect(r1.count).toBe(2)
  expect(r1.version).toBe(1)
  const got = getCatalog(db, storeId)
  expect(got.version).toBe(1)
  expect(got.items).toHaveLength(2)
  const r2 = replaceCatalog(db, storeId, [items[0]])
  expect(r2.version).toBe(2)
  expect(getCatalog(db, storeId).items).toHaveLength(1)
})

test("since: unchanged when version matches", () => {
  const { db, storeId } = setup()
  replaceCatalog(db, storeId, [{ barcode: "1", name: "a", category: null, expected: null }])
  const got = getCatalog(db, storeId, 1)
  expect(got.unchanged).toBe(true)
  expect(got.items).toBeUndefined()
  expect(getCatalog(db, storeId, 0).items).toHaveLength(1)
})

test("turkish names roundtrip exactly", () => {
  const { db, storeId } = setup()
  const name = "Şeftali Yoğurt İçeceği ğüşıÖÇ"
  replaceCatalog(db, storeId, [{ barcode: "869", name, category: "Yoğurt & Süt ürünleri", expected: null }])
  const item = getCatalog(db, storeId).items?.[0]
  expect(item?.name).toBe(name)
  expect(item?.category).toBe("Yoğurt & Süt ürünleri")
})

test("leading-zero barcode stays string", () => {
  const { db, storeId } = setup()
  replaceCatalog(db, storeId, [{ barcode: "0012345", name: "x", category: null, expected: null }])
  expect(getCatalog(db, storeId).items?.[0].barcode).toBe("0012345")
})

test("non-numeric expected is stored as null (no stored XSS)", () => {
  const { db, storeId } = setup()
  replaceCatalog(db, storeId, [
    {
      barcode: "1",
      name: "x",
      category: null,
      expected: "<img src=x onerror=alert(1)>" as unknown as number,
    },
  ])
  expect(getCatalog(db, storeId).items?.[0].expected).toBeNull()
})

test("bulk 20k rows under 3s", () => {
  const { db, storeId } = setup()
  const items: CatalogItem[] = Array.from({ length: 20000 }, (_, i) => ({
    barcode: String(8690000000000 + i),
    name: `Ürün ${i}`,
    category: `Kategori ${i % 20}`,
    expected: i % 7 === 0 ? null : i % 50,
  }))
  const start = Date.now()
  const r = replaceCatalog(db, storeId, items)
  expect(Date.now() - start).toBeLessThan(3000)
  expect(r.count).toBe(20000)
  expect(getCatalog(db, storeId).items).toHaveLength(20000)
})
