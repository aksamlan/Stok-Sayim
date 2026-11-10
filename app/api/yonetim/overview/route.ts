import { requireAuth } from "@/lib/server/auth"
import { getDb } from "@/lib/server/db"
import { handle, json } from "@/lib/server/http"
import { overview } from "@/lib/server/superadmin"

export const GET = handle((req) => {
  const db = getDb()
  requireAuth(db, req, "super")
  return json(overview(db))
})
