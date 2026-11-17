import { expect, test } from "vitest"
import { listActivity, logActivity, pruneActivity } from "../../lib/server/activity"
import { replaceCatalog } from "../../lib/server/catalog"
import { counterDetail, dashboard, recordEvents, type ScanEvent } from "../../lib/server/counts"
import { openDatabase } from "../../lib/server/db"
import { createSession, createStore } from "../../lib/server/stores"

let seq = 0
const ev = (sessionId: string, barcode: string, qty: number, createdAt = Date.now()): ScanEvent => ({
  id: `a${++seq}`,
  sessionId,
  barcode,
  qty,
  createdAt,
})

function setup() {
  const db = openDatabase(":memory:")
  const { storeId } = createStore(db, "Şube", "say123", "admin123")
  replaceCatalog(db, storeId, [
    { barcode: "1", name: "Süt", category: "K", expected: 10 },
    { barcode: "2", name: "Ekmek", category: "K", expected: 5 },
    { barcode: "3", name: "Yoğurt", category: "K", expected: 3 },
  ])
  const { id: sessionId } = createSession(db, storeId, "S")
  return { db, storeId, sessionId }
}

const all = { filter: "all" as const, page: 1, pageSize: 100 }

test("ürün silinince (net 0) çeşit sayısı da düşer, adet gibi", () => {
  const { db, storeId, sessionId } = setup()
  recordEvents(db, storeId, "Ali", [ev(sessionId, "1", 3), ev(sessionId, "2", 2)])
  expect(dashboard(db, storeId, sessionId, all).byCounter[0]).toMatchObject({ qty: 5, distinct: 2 })
  recordEvents(db, storeId, "Ali", [ev(sessionId, "2", -2)]) // silindi
  const c = dashboard(db, storeId, sessionId, all).byCounter[0]
  expect(c).toMatchObject({ qty: 3, distinct: 1 })
})

test("son okutma sunucu saatiyle: telefon saati 1 saat geride olsa da 'şimdi' görünür", () => {
  const { db, storeId, sessionId } = setup()
  const before = Date.now()
  recordEvents(db, storeId, "Ali", [ev(sessionId, "1", 1, before - 3600_000)]) // yanlış saatli telefon
  const d = dashboard(db, storeId, sessionId, all)
  expect(d.byCounter[0].lastAt).toBeGreaterThanOrEqual(before)
  expect(d.serverNow).toBeGreaterThanOrEqual(d.byCounter[0].lastAt)
})

test("yönetici listesi: sayılanlar üstte, en son okutulan en üstte", async () => {
  const { db, storeId, sessionId } = setup()
  recordEvents(db, storeId, "Ali", [ev(sessionId, "2", 1)])
  await new Promise((r) => setTimeout(r, 5))
  recordEvents(db, storeId, "Ali", [ev(sessionId, "3", 1)])
  const rows = dashboard(db, storeId, sessionId, all).rows
  expect(rows.map((r) => r.barcode).slice(0, 3)).toEqual(["3", "2", "1"])
  expect(rows[2].counted).toBe(0) // sayılmayan en altta
})

test("hareket geçmişi: okutmalar + işlemler tek çizelgede, kişiye göre süzülür, en yeni üstte", async () => {
  const { db, storeId, sessionId } = setup()
  logActivity(db, storeId, "Yönetici", "session_start", "S")
  logActivity(db, storeId, "Ayşe", "login")
  recordEvents(db, storeId, "Ayşe", [ev(sessionId, "1", 4)])
  await new Promise((r) => setTimeout(r, 5))
  recordEvents(db, storeId, "Mehmet", [ev(sessionId, "2", 1)])
  recordEvents(db, storeId, "Ayşe", [ev(sessionId, "1", -4)])
  const log = listActivity(db, storeId, { sessionId })
  expect(log[0]).toMatchObject({ actor: "Ayşe", action: "scan", qty: -4, name: "Süt" })
  expect(log.some((e) => e.action === "login" && e.actor === "Ayşe")).toBe(true)
  expect(log.some((e) => e.action === "session_start")).toBe(true)
  const ayse = listActivity(db, storeId, { sessionId, actor: "Ayşe" })
  expect(ayse.every((e) => e.actor === "Ayşe")).toBe(true)
  expect(listActivity(db, storeId, { limit: 2 })).toHaveLength(2)
  // başka mağaza göremez
  const other = createStore(db, "B", "say123", "admin123")
  expect(listActivity(db, other.storeId, {})).toHaveLength(0)
})

test("günlük 90 günden eskiyi siler (disk şişmez)", () => {
  const { db, storeId } = setup()
  db.prepare("INSERT INTO activity_log (store_id, at, actor, action) VALUES (?, ?, 'X', 'login')").run(
    storeId,
    Date.now() - 100 * 86400_000
  )
  logActivity(db, storeId, "Y", "login")
  expect(pruneActivity(db)).toBe(1)
  expect(listActivity(db, storeId, {}).filter((e) => e.action === "login")).toHaveLength(1)
})

test("sorgular indeks kullanır (tam tablo taraması yok)", () => {
  const { db, storeId, sessionId } = setup()
  const plan = (sql: string, ...p: unknown[]) =>
    (db.prepare("EXPLAIN QUERY PLAN " + sql).all(...(p as never[])) as { detail: string }[])
      .map((r) => r.detail)
      .join(" | ")
  expect(plan("SELECT * FROM scan_events WHERE store_id=? ORDER BY received_at DESC LIMIT 50", storeId)).toMatch(/idx_events_recent/)
  expect(plan("SELECT * FROM activity_log WHERE store_id=? ORDER BY at DESC LIMIT 50", storeId)).toMatch(/idx_activity_store_at/)
  expect(plan("SELECT barcode, SUM(qty) FROM scan_events WHERE store_id=? AND session_id=? GROUP BY barcode", storeId, sessionId)).toMatch(/idx_events_barcode/)
})

test("sayımcı detayı: yalnız kendi saydığı ürünler, net adet, en son okutulan üstte, arama çalışır", async () => {
  const { db, storeId, sessionId } = setup()
  recordEvents(db, storeId, "Ayşe", [ev(sessionId, "1", 3), ev(sessionId, "2", 2)])
  await new Promise((r) => setTimeout(r, 5))
  recordEvents(db, storeId, "Ayşe", [ev(sessionId, "3", 1), ev(sessionId, "2", -2)]) // 2 silindi
  recordEvents(db, storeId, "Mehmet", [ev(sessionId, "1", 9)])
  const d = counterDetail(db, storeId, sessionId, "Ayşe")
  expect(d.rows.map((r) => [r.barcode, r.qty])).toEqual([["3", 1], ["1", 3]]) // silinen yok, Mehmet'in 9'u yok
  expect(d).toMatchObject({ total: 2, totalQty: 4 })
  expect(d.rows[0].name).toBe("Yoğurt")
  expect(counterDetail(db, storeId, sessionId, "Ayşe", { search: "süt" }).rows.map((r) => r.barcode)).toEqual(["1"])
  expect(counterDetail(db, storeId, sessionId, "Ayşe", { limit: 1 })).toMatchObject({ total: 2 })
  expect(counterDetail(db, storeId, sessionId, "Ayşe", { limit: 1 }).rows).toHaveLength(1)
  // başka mağaza göremez
  const other = createStore(db, "B", "say123", "admin123")
  expect(counterDetail(db, other.storeId, sessionId, "Ayşe").rows).toHaveLength(0)
})

test("kilolu ürün: 2 ondalıklı adet kabul edilir, toplamlar kayma yapmaz, geçersizler reddedilir", () => {
  const { db, storeId, sessionId } = setup()
  // 0.1 + 0.2 = 0.30000000000000004 olmamalı
  recordEvents(db, storeId, "Ali", [ev(sessionId, "1", 0.1), ev(sessionId, "1", 0.2), ev(sessionId, "2", 2.5)])
  recordEvents(db, storeId, "Ali", [ev(sessionId, "2", 1.25)])
  const d = dashboard(db, storeId, sessionId, all)
  expect(d.rows.find((r) => r.barcode === "1")?.counted).toBe(0.3)
  expect(d.rows.find((r) => r.barcode === "2")?.counted).toBe(3.75)
  expect(d.totals.totalQty).toBe(4.05)
  expect(d.byCounter[0]).toMatchObject({ qty: 4.05, distinct: 2 })
  // azaltma: 3.75 - 1.25 = 2.5 ; tamamını silince çeşit düşer
  recordEvents(db, storeId, "Ali", [ev(sessionId, "2", -1.25)])
  expect(counterDetail(db, storeId, sessionId, "Ali").rows.find((r) => r.barcode === "2")?.qty).toBe(2.5)
  recordEvents(db, storeId, "Ali", [ev(sessionId, "2", -2.5)])
  expect(counterDetail(db, storeId, sessionId, "Ali").rows.map((r) => r.barcode)).toEqual(["1"])
  // geçersiz: 3 ondalık, sıfır, NaN, devasa
  for (const bad of [1.234, 0, NaN, Infinity, 1e9]) {
    expect(() => recordEvents(db, storeId, "Ali", [ev(sessionId, "1", bad)])).toThrow()
  }
  // beklenen ile eşitlik ondalıkta da çalışır
  replaceCatalog(db, storeId, [{ barcode: "9", name: "Elma", category: "M", expected: 2.5 }])
  recordEvents(db, storeId, "Ali", [ev(sessionId, "9", 1.5), ev(sessionId, "9", 1)])
  expect(dashboard(db, storeId, sessionId, all).rows.find((r) => r.barcode === "9")?.status).toBe("match")
})
