import type { DatabaseSync } from "node:sqlite"
import { ApiError } from "./auth"

export type CatalogItem = {
  barcode: string
  name: string
  expected: number | null
}

export function replaceCatalog(
  db: DatabaseSync,
  storeId: string,
  items: CatalogItem[]
): { count: number; version: number } {
  if (!Array.isArray(items)) throw new ApiError(400, "Geçersiz katalog verisi")
  const insert = db.prepare(
    "INSERT OR REPLACE INTO products (store_id, barcode, name, expected_qty) VALUES (?, ?, ?, ?)"
  )
  db.exec("BEGIN")
  try {
    db.prepare("DELETE FROM products WHERE store_id = ?").run(storeId)
    for (const item of items) {
      const barcode = String(item.barcode ?? "").trim()
      if (!barcode) continue
      insert.run(storeId, barcode, String(item.name ?? "").trim(), item.expected)
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
    .prepare("SELECT barcode, name, expected_qty AS expected FROM products WHERE store_id = ?")
    .all(storeId) as CatalogItem[]
  return { version, items: rows }
}
