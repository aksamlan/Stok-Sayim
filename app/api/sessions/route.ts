import { requireAuth } from "@/lib/server/auth"
import { getDb } from "@/lib/server/db"
import { handle, json, readBody } from "@/lib/server/http"
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
  return json(createSession(db, auth.storeId, body.name ?? ""))
})

export const PATCH = handle(async (req) => {
  const db = getDb()
  const auth = requireAuth(db, req, "admin")
  const body = await readBody<{ id: string; status: "closed" }>(req)
  closeSession(db, auth.storeId, body.id)
  return json({ ok: true })
})
