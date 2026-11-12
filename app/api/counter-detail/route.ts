import { ApiError, requireAuth } from "@/lib/server/auth"
import { counterDetail } from "@/lib/server/counts"
import { getDb } from "@/lib/server/db"
import { handle, json } from "@/lib/server/http"

// Yalnızca yönetici: seçilen sayımcının saydığı ürünler.
export const GET = handle((req) => {
  const db = getDb()
  const auth = requireAuth(db, req, "admin")
  const p = new URL(req.url).searchParams
  const sessionId = p.get("sessionId")
  const counter = p.get("counter")
  if (!sessionId || !counter) throw new ApiError(400, "sessionId ve counter gerekli")
  return json({
    ...counterDetail(db, auth.storeId, sessionId, counter, {
      search: p.get("search") || undefined,
      limit: Number(p.get("limit") ?? 100) || 100,
    }),
    serverNow: Date.now(),
  })
})
