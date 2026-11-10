import { requireAuth } from "@/lib/server/auth"
import { ApiError } from "@/lib/server/auth"
import { brandStatus, isBrandKind, resetBrand, setBrand } from "@/lib/server/brand"
import { getDb } from "@/lib/server/db"
import { handle, json, readBody } from "@/lib/server/http"

export const GET = handle((req) => {
  const db = getDb()
  requireAuth(db, req, "super")
  return json(brandStatus(db))
})

export const PUT = handle(async (req) => {
  const db = getDb()
  requireAuth(db, req, "super")
  const body = await readBody<{ kind: string; dataUrl: string }>(req)
  if (!isBrandKind(body.kind)) throw new ApiError(400, "Geçersiz tür")
  setBrand(db, body.kind, body.dataUrl)
  return json(brandStatus(db))
})

export const DELETE = handle((req) => {
  const db = getDb()
  requireAuth(db, req, "super")
  const kind = new URL(req.url).searchParams.get("kind") ?? ""
  if (!isBrandKind(kind)) throw new ApiError(400, "Geçersiz tür")
  resetBrand(db, kind)
  return json(brandStatus(db))
})
