import { requireAuth } from "@/lib/server/auth"
import { getDb } from "@/lib/server/db"
import { handle, json, readBody } from "@/lib/server/http"
import { logActivity } from "@/lib/server/activity"
import { closeSession, createSession, listSessions } from "@/lib/server/stores"

export const GET = handle((req) => {
  const db = getDb()
  const auth = requireAuth(db, req)
  return json({ sessions: listSessions(db, auth.storeId) })
})

export const POST = handle(async (req) => {
  const db = getDb()
  const auth = requireAuth(db, req, "admin")
  const body = await readBody<{ name: string }>(req)
  const created = createSession(db, auth.storeId, body.name ?? "")
  logActivity(db, auth.storeId, "Yönetici", "session_start", (body.name ?? "").trim())
  return json(created)
})

export const PATCH = handle(async (req) => {
  const db = getDb()
  const auth = requireAuth(db, req, "admin")
  const body = await readBody<{ id: string; status: "closed" }>(req)
  closeSession(db, auth.storeId, body.id)
  logActivity(db, auth.storeId, "Yönetici", "session_close")
  return json({ ok: true })
})
