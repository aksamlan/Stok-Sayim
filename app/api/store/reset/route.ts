import { logActivity } from "@/lib/server/activity"
import { ApiError, requireAuth } from "@/lib/server/auth"
import { getDb } from "@/lib/server/db"
import { handle, json, readBody } from "@/lib/server/http"
import { resetStoreData } from "@/lib/server/stores"

// Yalnızca yönetici. "all" için istemci ayrıca onay metni (SIL) ister; sunucu da
// aynı alanı doğrular ki yanlışlıkla/otomatik çağrı her şeyi silemesin.
export const POST = handle(async (req) => {
  const db = getDb()
  const auth = requireAuth(db, req, "admin")
  const body = await readBody<{ mode: string; sessionId?: string; confirm?: string }>(req)
  if (body.mode === "all") {
    if (body.confirm !== "SIL") throw new ApiError(400, "Onay metni hatalı")
    const r = resetStoreData(db, auth.storeId, "all")
    logActivity(db, auth.storeId, "Yönetici", "reset_all", `${r.removedEvents} okutma silindi`)
    return json(r)
  }
  if (body.mode === "counts") {
    const r = resetStoreData(db, auth.storeId, "counts", body.sessionId)
    logActivity(db, auth.storeId, "Yönetici", "reset_counts", `${r.removedEvents} okutma silindi`)
    return json(r)
  }
  throw new ApiError(400, "Geçersiz işlem")
})
