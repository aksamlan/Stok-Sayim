import { expect, test } from "vitest"
import { ApiError } from "../../lib/server/auth"
import { replaceCatalog } from "../../lib/server/catalog"
import {
  dashboard,
  myCounts,
  recordEvents,
  type ScanEvent,
} from "../../lib/server/counts"
import { openDatabase } from "../../lib/server/db"
import { closeSession, createSession, createStore } from "../../lib/server/stores"

let seq = 0
function ev(sessionId: string, barcode: string, qty: number): ScanEvent {
  return { id: `e${++seq}`, sessionId, barcode, qty, createdAt: Date.now() }
}

function setup() {
  const db = openDatabase(":memory:")
  const { storeId } = createStore(db, "Şube", "say123", "admin123")
  replaceCatalog(db, storeId, [
    { barcode: "869001", name: "Süt", category: "Kahvaltılık", expected: 10 },
    { barcode: "869002", name: "Ekmek", category: "Fırın", expected: 5 },
    { barcode: "869003", name: "Yoğurt", category: "Kahvaltılık", expected: 3 },
    { barcode: "869004", name: "Şeftali İçeceği", category: "İçecek", expected: 2 },
  ])
  const { id: sessionId } = createSession(db, storeId, "Test Sayımı")
  return { db, storeId, sessionId }
}

test("recordEvents is idempotent", () => {
  const { db, storeId, sessionId } = setup()
  const batch = [ev(sessionId, "869001", 3), ev(sessionId, "869001", 4)]
  expect(recordEvents(db, storeId, "Ali", batch).accepted).toBe(2)
  expect(recordEvents(db, storeId, "Ali", batch).accepted).toBe(0)
  expect(myCounts(db, storeId, sessionId, "Ali")).toEqual([
    { barcode: "869001", qty: 7 },
  ])
})

test("two counters on same barcode merge additively", () => {
  const { db, storeId, sessionId } = setup()
  recordEvents(db, storeId, "Ali", [ev(sessionId, "869001", 3)])
  recordEvents(db, storeId, "Ayşe", [ev(sessionId, "869001", 4)])
  const d = dashboard(db, storeId, sessionId, {
    filter: "all",
    page: 1,
    pageSize: 100,
  })
  const row = d.rows.find((r) => r.barcode === "869001")
  expect(row?.counted).toBe(7)
  expect(d.byCounter).toHaveLength(2)
  expect(d.byCounter.map((c) => c.counter).sort()).toEqual(["Ali", "Ayşe"])
})

test("negative delta removes from myCounts and zero-count becomes only-stock", () => {
  const { db, storeId, sessionId } = setup()
  recordEvents(db, storeId, "Ali", [ev(sessionId, "869002", 5)])
  recordEvents(db, storeId, "Ali", [ev(sessionId, "869002", -5)])
  expect(myCounts(db, storeId, sessionId, "Ali")).toEqual([])
  const d = dashboard(db, storeId, sessionId, { filter: "all", page: 1, pageSize: 100 })
  expect(d.rows.find((r) => r.barcode === "869002")?.status).toBe("only-stock")
})

test("unknown barcode gets status only-count and counts in totals", () => {
  const { db, storeId, sessionId } = setup()
  recordEvents(db, storeId, "Ali", [ev(sessionId, "999999", 2)])
  const d = dashboard(db, storeId, sessionId, { filter: "all", page: 1, pageSize: 100 })
  const row = d.rows.find((r) => r.barcode === "999999")
  expect(row?.status).toBe("only-count")
  expect(row?.name).toBeNull()
  expect(d.totals.unknownCount).toBe(1)
  expect(d.totals.totalQty).toBe(2)
})

test("problems filter and search", () => {
  const { db, storeId, sessionId } = setup()
  recordEvents(db, storeId, "Ali", [
    ev(sessionId, "869001", 10), // match
    ev(sessionId, "869002", 4), // difference
    ev(sessionId, "999999", 1), // only-count
  ])
  const problems = dashboard(db, storeId, sessionId, {
    filter: "problems",
    page: 1,
    pageSize: 100,
  })
  expect(problems.rows.map((r) => r.barcode).sort()).toEqual([
    "869002",
    "869003", // only-stock (never counted)
    "869004", // only-stock (never counted)
    "999999",
  ])
  const search = dashboard(db, storeId, sessionId, {
    filter: "all",
    search: "ekmek",
    page: 1,
    pageSize: 100,
  })
  expect(search.rows).toHaveLength(1)
  expect(search.rows[0].barcode).toBe("869002")
})

test("byCategory breakdown and category filter", () => {
  const { db, storeId, sessionId } = setup()
  recordEvents(db, storeId, "Ali", [
    ev(sessionId, "869001", 4),
    ev(sessionId, "869003", 2),
    ev(sessionId, "869002", 1),
    ev(sessionId, "999999", 9),
  ])
  const d = dashboard(db, storeId, sessionId, { filter: "all", page: 1, pageSize: 100 })
  const kahvalti = d.byCategory.find((c) => c.category === "Kahvaltılık")
  expect(kahvalti?.counted).toBe(6)
  expect(kahvalti?.expected).toBe(13)
  const uncat = d.byCategory.find((c) => c.category === null)
  expect(uncat?.counted).toBe(9)
  const filtered = dashboard(db, storeId, sessionId, {
    filter: "all",
    category: "Kahvaltılık",
    page: 1,
    pageSize: 100,
  })
  expect(filtered.rows.map((r) => r.barcode).sort()).toEqual(["869001", "869003"])
  expect(filtered.rows[0].category).toBe("Kahvaltılık")
})

test("closed session rejects events", () => {
  const { db, storeId, sessionId } = setup()
  closeSession(db, storeId, sessionId)
  try {
    recordEvents(db, storeId, "Ali", [ev(sessionId, "869001", 1)])
    expect.unreachable()
  } catch (e) {
    expect((e as ApiError).status).toBe(409)
  }
})

test("more than 1000 events per request rejected", () => {
  const { db, storeId, sessionId } = setup()
  const batch = Array.from({ length: 1001 }, () => ev(sessionId, "869001", 1))
  try {
    recordEvents(db, storeId, "Ali", batch)
    expect.unreachable()
  } catch (e) {
    expect((e as ApiError).status).toBe(400)
  }
})

test("invalid createdAt rejected with 400", () => {
  const { db, storeId, sessionId } = setup()
  try {
    recordEvents(db, storeId, "Ali", [
      {
        id: "bad1",
        sessionId,
        barcode: "869001",
        qty: 1,
        createdAt: "sprintf" as unknown as number,
      },
    ])
    expect.unreachable()
  } catch (e) {
    expect((e as ApiError).status).toBe(400)
  }
})

test("pagination reports rowTotal", () => {
  const { db, storeId, sessionId } = setup()
  const d = dashboard(db, storeId, sessionId, { filter: "all", page: 1, pageSize: 3 })
  expect(d.rowTotal).toBe(4)
  expect(d.rows).toHaveLength(3)
  const p2 = dashboard(db, storeId, sessionId, { filter: "all", page: 2, pageSize: 3 })
  expect(p2.rows).toHaveLength(1)
})

test("turkish case-insensitive search (İ/ı)", () => {
  const { db, storeId, sessionId } = setup()
  const d = dashboard(db, storeId, sessionId, {
    filter: "all",
    search: "şeftali iç",
    page: 1,
    pageSize: 100,
  })
  expect(d.rows.map((r) => r.barcode)).toEqual(["869004"])
  const upper = dashboard(db, storeId, sessionId, {
    filter: "all",
    search: "İÇECEĞİ",
    page: 1,
    pageSize: 100,
  })
  expect(upper.rows.map((r) => r.barcode)).toEqual(["869004"])
})

test("distinctCounted only counts catalog barcodes", () => {
  const { db, storeId, sessionId } = setup()
  recordEvents(db, storeId, "Ali", [
    ev(sessionId, "869001", 2),
    ev(sessionId, "999999", 5), // listede yok: çeşide dahil edilmez
  ])
  const d = dashboard(db, storeId, sessionId, { filter: "all", page: 1, pageSize: 100 })
  expect(d.totals.distinctCounted).toBe(1)
  expect(d.totals.totalQty).toBe(7)
  expect(d.totals.unknownCount).toBe(1)
})
