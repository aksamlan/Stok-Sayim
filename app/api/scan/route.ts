import { requireAuth } from "@/lib/server/auth"
import { recordEvents, type ScanEvent } from "@/lib/server/counts"
import { getDb } from "@/lib/server/db"
import { handle, json, readBody } from "@/lib/server/http"

export const POST = handle(async (req) => {
  const db = getDb()
  const auth = requireAuth(db, req)
  const body = await readBody<{ events: ScanEvent[] }>(req)
  const counter = auth.role === "admin" ? "Yönetici" : auth.counter
  return json(recordEvents(db, auth.storeId, counter, body.events ?? []))
})
