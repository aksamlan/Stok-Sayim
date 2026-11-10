import { ApiError, requireAuth } from "@/lib/server/auth"
import { getDb } from "@/lib/server/db"
import { handle, json, readBody } from "@/lib/server/http"
import { deleteStore, resetStorePassword } from "@/lib/server/superadmin"

export const PATCH = handle(async (req) => {
  const db = getDb()
  requireAuth(db, req, "super")
  const body = await readBody<{
    storeId: string
    which: "count" | "admin"
    newPassword: string
  }>(req)
  if (body.which !== "count" && body.which !== "admin") {
    throw new ApiError(400, "Geçersiz şifre türü")
  }
  resetStorePassword(db, body.storeId ?? "", body.which, body.newPassword ?? "")
  return json({ ok: true })
})

export const DELETE = handle((req) => {
  const db = getDb()
  requireAuth(db, req, "super")
  const id = new URL(req.url).searchParams.get("id")
  if (!id) throw new ApiError(400, "id gerekli")
  deleteStore(db, id)
  return json({ ok: true })
})
