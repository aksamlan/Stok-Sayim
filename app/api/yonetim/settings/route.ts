import { requireAuth } from "@/lib/server/auth"
import { getRetentionDays, setRetentionDays } from "@/lib/server/cleanup"
import { getDb } from "@/lib/server/db"
import { handle, json, readBody } from "@/lib/server/http"
import { mailConfigured } from "@/lib/server/mail"

export const GET = handle((req) => {
  const db = getDb()
  requireAuth(db, req, "super")
  return json({
    retentionDays: getRetentionDays(db),
    mailConfigured: mailConfigured(),
  })
})

export const PATCH = handle(async (req) => {
  const db = getDb()
  requireAuth(db, req, "super")
  const body = await readBody<{ retentionDays: number }>(req)
  setRetentionDays(db, Number(body.retentionDays))
  return json({ ok: true, retentionDays: getRetentionDays(db) })
})
