import { ApiError, requireAuth } from "@/lib/server/auth"
import { logActivity } from "@/lib/server/activity"
import { counterDetail, decreaseCounterItem, removeCounterItem } from "@/lib/server/counts"
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

// Yönetici: sayımcının bir ürünündeki sayımı kaldırır (aktif sayımda).
export const DELETE = handle((req) => {
  const db = getDb()
  const auth = requireAuth(db, req, "admin")
  const p = new URL(req.url).searchParams
  const sessionId = p.get("sessionId")
  const counter = p.get("counter")
  const barcode = p.get("barcode")
  if (!sessionId || !counter || !barcode) throw new ApiError(400, "sessionId, counter ve barcode gerekli")
  const r = removeCounterItem(db, auth.storeId, sessionId, counter, barcode)
  logActivity(db, auth.storeId, "Yönetici", "remove_count", `${barcode}: ${counter}'ın ${r.removed} adedi yönetici tarafından silindi`)
  return json(r)
})

// Yönetici: sayımcının bir üründeki adedini eksiltir (yeni adet mevcuttan küçük olmalı).
export const PATCH = handle(async (req) => {
  const db = getDb()
  const auth = requireAuth(db, req, "admin")
  const body = (await req.json().catch(() => ({}))) as {
    sessionId?: string
    counter?: string
    barcode?: string
    qty?: number
  }
  if (!body.sessionId || !body.counter || !body.barcode) throw new ApiError(400, "sessionId, counter ve barcode gerekli")
  const r = decreaseCounterItem(db, auth.storeId, body.sessionId, body.counter, body.barcode, Number(body.qty))
  logActivity(db, auth.storeId, "Yönetici", "adjust_count", `${body.barcode}: ${body.counter}'ın adedi ${r.from} → ${r.to} yapıldı`)
  return json(r)
})
