// Kullanım: node loadprices.mjs <db> <xlsx>  — tüm mağazalara satış/alış fiyatlarını yazar (stok/ürün/sayım değişmez)
import { createRequire } from "node:module"
import { DatabaseSync } from "node:sqlite"
const require = createRequire("/app/")
const XLSX = require("xlsx")
const [dbPath, file] = process.argv.slice(2)
const wb = XLSX.readFile(file)
const all = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: "" })
const H = all[0].map(String)
const ix = (n) => H.findIndex((h) => h.trim().toLowerCase() === n.toLowerCase())
const bi = ix("Genel Barkod"), ai = ix("Genel Alış Fiyatı"), gs = ix("Genel Satış Fiyatı"), f2 = ix("fiyat 2"), f3 = ix("fiyat 3"), f4 = ix("fiyat 4")
if ([bi, ai, f2, f4].some((i) => i < 0)) throw new Error("beklenen sütunlar yok: " + JSON.stringify(H))
const price = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 && n <= 10_000_000 ? Math.round(n * 100) / 100 : null }
const byBarcode = new Map()
for (const r of all.slice(1)) {
  const b = String(r[bi] ?? "").trim(); if (!b) continue
  const sale = price(r[f2]) ?? price(r[f4]) ?? price(r[f3]) ?? price(r[gs])
  byBarcode.set(b, { sale, cost: price(r[ai]) }) // tekrarlarda SON satır (ürün listesiyle aynı kural)
}
console.log("dosyada benzersiz barkod:", byBarcode.size, "· satış fiyatı olan:", [...byBarcode.values()].filter((v) => v.sale).length, "· alış fiyatı olan:", [...byBarcode.values()].filter((v) => v.cost).length)
const db = new DatabaseSync(dbPath)
db.exec("PRAGMA busy_timeout=30000")
const upd = db.prepare("UPDATE products SET sale_price = ?, cost_price = ? WHERE store_id = ? AND barcode = ?")
const stores = db.prepare("SELECT id, code, name FROM stores ORDER BY code").all()
db.exec("BEGIN IMMEDIATE")
try {
  for (const s of stores) {
    let updated = 0, withSale = 0, withCost = 0, notInFile = 0
    for (const { barcode } of db.prepare("SELECT barcode FROM products WHERE store_id = ?").all(s.id)) {
      const v = byBarcode.get(barcode)
      if (!v) { notInFile++; continue }
      upd.run(v.sale, v.cost, s.id, barcode); updated++
      if (v.sale) withSale++
      if (v.cost) withCost++
    }
    db.prepare("INSERT INTO activity_log (store_id, at, actor, action, detail) VALUES (?, ?, 'Yönetici', 'price_upload', ?)").run(s.id, Date.now(), `${updated} ürünün fiyatı yüklendi (satış ${withSale}, alış ${withCost})`)
    console.log(`${s.code} ${s.name}: güncellenen ${updated} · satış fiyatlı ${withSale} · alış fiyatlı ${withCost} · dosyada yok ${notInFile}`)
  }
  db.exec("COMMIT")
} catch (e) { db.exec("ROLLBACK"); throw e }
db.close()
