import { logActivity } from "@/lib/server/activity"
import { ApiError, requireAuth } from "@/lib/server/auth"
import { getDb } from "@/lib/server/db"
import { handle, json } from "@/lib/server/http"
import { listCounters, resetCounterPin } from "@/lib/server/stores"

// Kayıtlı tüm sayımcılar (hiç okutmamışlar dahil) — PIN yönetimi için.
export const GET = handle((req) => {
  const db = getDb()
  const auth = requireAuth(db, req, "admin")
  return json({ counters: listCounters(db, auth.storeId) })
})

// Yönetici, PIN'ini unutan sayımcının PIN kaydını siler; sayımcı aynı isimle
// yeni bir PIN belirleyerek tekrar girer. Sayım verisi silinmez.
export const DELETE = handle((req) => {
  const db = getDb()
  const auth = requireAuth(db, req, "admin")
  const name = new URL(req.url).searchParams.get("name")
  if (!name) throw new ApiError(400, "name gerekli")
  resetCounterPin(db, auth.storeId, name)
  logActivity(db, auth.storeId, "Yönetici", "counter_reset", name)
  return json({ ok: true })
})
