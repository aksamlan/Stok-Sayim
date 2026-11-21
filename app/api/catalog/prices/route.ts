import { logActivity } from "@/lib/server/activity"
import { requireAuth } from "@/lib/server/auth"
import { updatePrices } from "@/lib/server/catalog"
import { getDb } from "@/lib/server/db"
import { handle, json, readBody } from "@/lib/server/http"

// Yönetici: yalnız satış/alış fiyatlarını günceller (ürün listesi ve sayımlar değişmez).
export const PUT = handle(async (req) => {
  const db = getDb()
  const auth = requireAuth(db, req, "admin")
  const body = await readBody<{
    items: { barcode: string; salePrice?: number | null; costPrice?: number | null }[]
  }>(req)
  const r = updatePrices(db, auth.storeId, body.items)
  logActivity(db, auth.storeId, "Yönetici", "price_upload", `${r.updated} ürünün fiyatı güncellendi`)
  return json(r)
})
