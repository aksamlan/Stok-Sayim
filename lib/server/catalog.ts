import type { DatabaseSync } from "node:sqlite"
import { ApiError } from "./auth"

export type CatalogItem = {
  barcode: string
  name: string
  category: string | null
  expected: number | null
  // Fiyatlar yalnız yöneticiye gider (sayımcıya asla); undefined = dokunma/yok
  salePrice?: number | null
  costPrice?: number | null
}

const MAX_PRICE = 10_000_000
// Geçerli fiyat: sonlu, 0..10 milyon, 2 ondalığa yuvarlı. 0 ve geçersiz = fiyat yok (null).
export function normPrice(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0 || v > MAX_PRICE) return null
  return Math.round(v * 100) / 100
}

export function replaceCatalog(
  db: DatabaseSync,
  storeId: string,
  items: CatalogItem[]
): { count: number; version: number } {
  if (!Array.isArray(items)) throw new ApiError(400, "Geçersiz katalog verisi")
  const insert = db.prepare(
    "INSERT OR REPLACE INTO products (store_id, barcode, name, category, expected_qty, sale_price, cost_price) VALUES (?, ?, ?, ?, ?, ?, ?)"
  )
  db.exec("BEGIN")
  try {
    // Yeni listede fiyat sütunu yoksa mevcut fiyatlar KAYBOLMASIN: eskileri sakla
    const oldPrices = new Map<string, { s: number | null; c: number | null }>()
    for (const r of db
      .prepare("SELECT barcode, sale_price AS s, cost_price AS c FROM products WHERE store_id = ?")
      .all(storeId) as { barcode: string; s: number | null; c: number | null }[]) {
      if (r.s != null || r.c != null) oldPrices.set(r.barcode, { s: r.s, c: r.c })
    }
    db.prepare("DELETE FROM products WHERE store_id = ?").run(storeId)
    for (const item of items) {
      const barcode = String(item.barcode ?? "").trim()
      if (!barcode) continue
      const category = item.category == null ? null : String(item.category).trim() || null
      const expected =
        typeof item.expected === "number" && Number.isFinite(item.expected)
          ? item.expected
          : null
      const old = oldPrices.get(barcode)
      const sale = item.salePrice === undefined ? (old?.s ?? null) : normPrice(item.salePrice)
      const cost = item.costPrice === undefined ? (old?.c ?? null) : normPrice(item.costPrice)
      insert.run(storeId, barcode, String(item.name ?? "").trim(), category, expected, sale, cost)
    }
    db.prepare(
      "UPDATE stores SET catalog_version = catalog_version + 1 WHERE id = ?"
    ).run(storeId)
    db.exec("COMMIT")
  } catch (e) {
    db.exec("ROLLBACK")
    throw e
  }
  return { count: catalogSize(db, storeId), version: catalogVersion(db, storeId) }
}

export function catalogVersion(db: DatabaseSync, storeId: string): number {
  const row = db
    .prepare("SELECT catalog_version AS v FROM stores WHERE id = ?")
    .get(storeId) as { v: number } | undefined
  return row?.v ?? 0
}

export function catalogSize(db: DatabaseSync, storeId: string): number {
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM products WHERE store_id = ?")
    .get(storeId) as { n: number }
  return row.n
}

export function getCatalog(
  db: DatabaseSync,
  storeId: string,
  since?: number
): { version: number; unchanged?: true; items?: CatalogItem[] } {
  const version = catalogVersion(db, storeId)
  if (since !== undefined && since === version) return { version, unchanged: true }
  const rows = db
    .prepare(
      "SELECT barcode, name, category, expected_qty AS expected, sale_price AS salePrice, cost_price AS costPrice FROM products WHERE store_id = ?"
    )
    .all(storeId) as CatalogItem[]
  return { version, items: rows }
}

// Yalnız fiyatları günceller (ürün listesi, beklenen stok ve sayımlara dokunmaz).
// Verilmeyen alan (undefined) mevcut fiyatı korur. Listede olmayan barkodlar sayılır, atlanır.
export function updatePrices(
  db: DatabaseSync,
  storeId: string,
  items: { barcode: string; salePrice?: number | null; costPrice?: number | null }[]
): { updated: number; missing: number } {
  if (!Array.isArray(items)) throw new ApiError(400, "Geçersiz fiyat verisi")
  if (items.length > 300_000) throw new ApiError(400, "Tek seferde en fazla 300.000 satır")
  const upd = db.prepare(
    `UPDATE products SET
       sale_price = CASE WHEN ? = 1 THEN ? ELSE sale_price END,
       cost_price = CASE WHEN ? = 1 THEN ? ELSE cost_price END
     WHERE store_id = ? AND barcode = ?`
  )
  let updated = 0
  let missing = 0
  db.exec("BEGIN")
  try {
    for (const it of items) {
      const barcode = String(it?.barcode ?? "").trim()
      if (!barcode) continue
      const hasSale = it.salePrice !== undefined
      const hasCost = it.costPrice !== undefined
      if (!hasSale && !hasCost) continue
      const r = upd.run(
        hasSale ? 1 : 0,
        hasSale ? normPrice(it.salePrice) : null,
        hasCost ? 1 : 0,
        hasCost ? normPrice(it.costPrice) : null,
        storeId,
        barcode
      )
      if (Number(r.changes) > 0) updated++
      else missing++
    }
    db.exec("COMMIT")
  } catch (e) {
    db.exec("ROLLBACK")
    throw e
  }
  return { updated, missing }
}
