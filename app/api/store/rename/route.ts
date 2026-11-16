import { requireAuth } from "@/lib/server/auth"
import { getDb } from "@/lib/server/db"
import { handle, json, readBody } from "@/lib/server/http"
import { renameStore } from "@/lib/server/stores"

// Mağaza yöneticisi kendi mağazasının adını değiştirir.
export const POST = handle(async (req) => {
  const db = getDb()
  const auth = requireAuth(db, req, "admin")
  const body = await readBody<{ name: string }>(req)
  return json({ name: renameStore(db, auth.storeId, body.name ?? "") })
})
