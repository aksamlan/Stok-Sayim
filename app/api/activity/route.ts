import { requireAuth } from "@/lib/server/auth"
import { listActivity } from "@/lib/server/activity"
import { getDb } from "@/lib/server/db"
import { handle, json } from "@/lib/server/http"

// Yalnızca yönetici: kim ne zaman ne yaptı (okutma, silme, giriş, sayım işlemleri).
export const GET = handle((req) => {
  const db = getDb()
  const auth = requireAuth(db, req, "admin")
  const p = new URL(req.url).searchParams
  return json({
    entries: listActivity(db, auth.storeId, {
      sessionId: p.get("sessionId") || undefined,
      actor: p.get("actor") || undefined,
      limit: Number(p.get("limit") ?? 50) || 50,
    }),
    serverNow: Date.now(),
  })
})
