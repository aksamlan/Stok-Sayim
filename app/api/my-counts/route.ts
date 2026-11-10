import { ApiError, requireAuth } from "@/lib/server/auth"
import { myCounts } from "@/lib/server/counts"
import { getDb } from "@/lib/server/db"
import { handle, json } from "@/lib/server/http"

export const GET = handle((req) => {
  const db = getDb()
  const auth = requireAuth(db, req)
  const sessionId = new URL(req.url).searchParams.get("sessionId")
  if (!sessionId) throw new ApiError(400, "sessionId gerekli")
  // /api/scan yönetici okutmalarını "Yönetici" adıyla yazar; burada da aynı
  // ad kullanılmalı ki yöneticinin kendi listesi yeni cihazda geri gelsin.
  const counter = auth.role === "admin" ? "Yönetici" : auth.counter
  return json({ items: myCounts(db, auth.storeId, sessionId, counter) })
})
