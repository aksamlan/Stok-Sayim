import { expect, test } from "vitest"
import { getCatalog, normPrice, replaceCatalog, updatePrices } from "../../lib/server/catalog"
import { dashboard, recordEvents, type ScanEvent } from "../../lib/server/counts"
import { openDatabase } from "../../lib/server/db"
import { createSession, createStore } from "../../lib/server/stores"

let seq = 0
const ev = (sessionId: string, barcode: string, qty: number): ScanEvent => ({
  id: `p${++seq}`,
  sessionId,
  barcode,
  qty,
  createdAt: Date.now(),
})
const all = { filter: "all" as const, page: 1, pageSize: 100 }

function setup() {
  const db = openDatabase(":memory:")
  const { storeId } = createStore(db, "Şube", "say123", "admin123")
  replaceCatalog(db, storeId, [
    { barcode: "1", name: "Süt", category: "K", expected: 10, salePrice: 22.5, costPrice: 17.25 },
    { barcode: "2", name: "Ekmek", category: "K", expected: 4, salePrice: 5, costPrice: null },
    { barcode: "3", name: "Fiyatsız", category: "K", expected: 2 },
  ])
  const { id: sessionId } = createSession(db, storeId, "S")
  return { db, storeId, sessionId }
}

test("normPrice: 0/negatif/NaN/devasa = fiyat yok, 2 ondalığa yuvarlar", () => {
  expect(normPrice(12.3456)).toBe(12.35)
  for (const bad of [0, -1, NaN, Infinity, 1e9, "5", null, undefined]) expect(normPrice(bad)).toBeNull()
})

test("tutarlar: sayılan×fiyat, beklenen×fiyat, fiyatı olmayan 0 katar ve sayılır", () => {
  const { db, storeId, sessionId } = setup()
  recordEvents(db, storeId, "Ali", [ev(sessionId, "1", 3), ev(sessionId, "2", 2), ev(sessionId, "3", 5), ev(sessionId, "999", 1)])
  const v = dashboard(db, storeId, sessionId, all).totals.value
  expect(v.saleCounted).toBe(3 * 22.5 + 2 * 5) // 77,5 (fiyatsız ürünler 0)
  expect(v.costCounted).toBe(3 * 17.25) // yalnız 1 numaralının alış fiyatı var
  expect(v.saleExpected).toBe(10 * 22.5 + 4 * 5)
  expect(v.costExpected).toBe(10 * 17.25)
  expect(v.salePriced).toBe(2)
  expect(v.costPriced).toBe(1)
  expect(v.countedNoSale).toBe(2) // "3" ve katalogda olmayan "999"
  expect(v.countedNoCost).toBe(3)
  const row = dashboard(db, storeId, sessionId, all).rows.find((r) => r.barcode === "1")
  expect(row).toMatchObject({ salePrice: 22.5, costPrice: 17.25 })
})

test("eksi stok beklenen tutara eksi katmaz (0 sayılır), eksi stoklu ürün sayılır", () => {
  const { db, storeId, sessionId } = setup()
  replaceCatalog(db, storeId, [
    { barcode: "1", name: "A", category: "K", expected: 10, salePrice: 10, costPrice: 5 },
    { barcode: "2", name: "B", category: "K", expected: -50, salePrice: 100, costPrice: 40 }, // ERP'de eksi stok
  ])
  const v = dashboard(db, storeId, sessionId, all).totals.value
  expect(v.saleExpected).toBe(100) // yalnız A: 10 × 10
  expect(v.costExpected).toBe(50)
  expect(v.negativeStock).toBe(1)
})

test("kilolu adet × fiyat kayma yapmaz", () => {
  const { db, storeId, sessionId } = setup()
  recordEvents(db, storeId, "Ali", [ev(sessionId, "1", 0.1), ev(sessionId, "1", 0.2)])
  expect(dashboard(db, storeId, sessionId, all).totals.value.saleCounted).toBe(6.75) // 0,3 × 22,5
})

test("ürün listesi yeniden yüklenince fiyat sütunu yoksa mevcut fiyatlar korunur", () => {
  const { db, storeId } = setup()
  replaceCatalog(db, storeId, [{ barcode: "1", name: "Süt (yeni ad)", category: "K", expected: 99 }]) // fiyat alanı yok
  const row = getCatalog(db, storeId).items!.find((i) => i.barcode === "1")
  expect(row).toMatchObject({ name: "Süt (yeni ad)", expected: 99, salePrice: 22.5, costPrice: 17.25 })
  // açıkça null verilirse silinir
  replaceCatalog(db, storeId, [{ barcode: "1", name: "Süt", category: "K", expected: 1, salePrice: null }])
  expect(getCatalog(db, storeId).items![0]).toMatchObject({ salePrice: null, costPrice: 17.25 })
})

test("yalnız fiyat güncelleme: stok/ad değişmez, verilmeyen alan korunur, listede olmayan sayılır", () => {
  const { db, storeId } = setup()
  const r = updatePrices(db, storeId, [
    { barcode: "1", salePrice: 30 }, // alış aynen kalır
    { barcode: "2", costPrice: 3.5 },
    { barcode: "3", salePrice: 0 }, // 0 = fiyat yok
    { barcode: "yok", salePrice: 9 },
    { barcode: "" },
  ])
  expect(r).toEqual({ updated: 3, missing: 1 })
  const byCode = Object.fromEntries(getCatalog(db, storeId).items!.map((i) => [i.barcode, i]))
  expect(byCode["1"]).toMatchObject({ name: "Süt", expected: 10, salePrice: 30, costPrice: 17.25 })
  expect(byCode["2"]).toMatchObject({ salePrice: 5, costPrice: 3.5 })
  expect(byCode["3"].salePrice).toBeNull()
  // başka mağazanın ürününe dokunulmaz
  const other = createStore(db, "B", "say123", "admin123")
  replaceCatalog(db, other.storeId, [{ barcode: "1", name: "X", category: null, expected: 1, salePrice: 1 }])
  updatePrices(db, storeId, [{ barcode: "1", salePrice: 99 }])
  expect(getCatalog(db, other.storeId).items![0].salePrice).toBe(1)
})

test("karşılaştırma: fark adedi/tutarı (eksi stok 0), fiyatsızda tutar null; sıralama eksik/fazla/ad/fark", () => {
  const { db, storeId, sessionId } = setup() // 1: stok 10, sat 22,5/alış 17,25 · 2: stok 4, sat 5 · 3: stok 2 fiyatsız
  recordEvents(db, storeId, "Ali", [ev(sessionId, "1", 7), ev(sessionId, "2", 6), ev(sessionId, "3", 5), ev(sessionId, "777", 1)])
  const rows = (sort: string) => dashboard(db, storeId, sessionId, { ...all, sort: sort as never }).rows
  const r1 = rows("recent").find((r) => r.barcode === "1")!
  expect(r1).toMatchObject({ diffQty: -3, diffSale: -67.5, diffCost: -51.75 }) // 3 eksik × fiyat
  expect(rows("recent").find((r) => r.barcode === "2")).toMatchObject({ diffQty: 2, diffSale: 10, diffCost: null }) // fazla; alışı yok
  expect(rows("recent").find((r) => r.barcode === "3")).toMatchObject({ diffQty: 3, diffSale: null, diffCost: null }) // fiyatsız
  expect(rows("recent").find((r) => r.barcode === "777")).toMatchObject({ diffQty: 1, diffSale: null }) // listede yok
  // sıralamalar
  expect(rows("short_sale").map((r) => r.barcode).slice(0, 2)).toEqual(["1", "2"]) // en eksik (−67,5), sonra +10; fiyatsızlar sonda
  expect(rows("over_sale")[0].barcode).toBe("2") // en fazla +10
  expect(rows("diff_qty")[0].diffQty).toBe(-3)
  expect(rows("name").map((r) => r.name).filter(Boolean)).toEqual(["Ekmek", "Fiyatsız", "Süt"])
  expect(rows("sql;drop table products" as never).length).toBeGreaterThan(0) // bilinmeyen sıralama → varsayılan, enjeksiyon yok
  // eksi stok farkta 0 sayılır
  replaceCatalog(db, storeId, [{ barcode: "9", name: "Eksi", category: null, expected: -20, salePrice: 10 }])
  recordEvents(db, storeId, "Ali", [ev(sessionId, "9", 2)])
  expect(rows("recent").find((r) => r.barcode === "9")).toMatchObject({ diffQty: 2, diffSale: 20 })
})
