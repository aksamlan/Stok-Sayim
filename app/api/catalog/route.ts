import { logActivity } from "@/lib/server/activity"
import { requireAuth } from "@/lib/server/auth"
import {
  catalogSize,
  catalogVersion,
  getCatalog,
  replaceCatalog,
  type CatalogItem,
} from "@/lib/server/catalog"
import { getDb } from "@/lib/server/db"
import { handle, json, readBody } from "@/lib/server/http"

export const GET = handle((req) => {
  const db = getDb()
  const auth = requireAuth(db, req)
  const params = new URL(req.url).searchParams
  if (params.get("countOnly")) {
    return json({
      version: catalogVersion(db, auth.storeId),
      count: catalogSize(db, auth.storeId),
    })
  }
  const sinceRaw = params.get("since")
  const since = sinceRaw === null ? undefined : Number(sinceRaw)
  const result = getCatalog(db, auth.storeId, Number.isFinite(since) ? since : undefined)
  // Beklenen stok adedi yalnız yöneticiye gider; sayımcılar ürün adı ve
  // kategoriyi görür ama stok rakamlarını göremez.
  if (auth.role !== "admin" && result.items) {
    result.items = result.items.map((i) => ({ ...i, expected: null }))
  }
  return json(result)
})

export const PUT = handle(async (req) => {
  const db = getDb()
  const auth = requireAuth(db, req, "admin")
  const body = await readBody<{ items: CatalogItem[] }>(req)
  const r = replaceCatalog(db, auth.storeId, body.items)
  logActivity(db, auth.storeId, "Yönetici", "catalog_upload", `${r.count} ürün`)
  return json(r)
})
