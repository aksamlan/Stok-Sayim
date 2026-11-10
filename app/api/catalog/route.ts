import { requireAuth } from "@/lib/server/auth"
import {
  catalogSize,
  catalogVersion,
  getCatalog,
  replaceCatalog,
  type CatalogItem,
} from "@/lib/server/catalog"
import { getDb } from "@/lib/server/db"
import { handle, json, readBody } from "@/lib/server/http"

export const GET = handle((req) => {
  const db = getDb()
  const auth = requireAuth(db, req)
  const params = new URL(req.url).searchParams
  if (params.get("countOnly")) {
    return json({
      version: catalogVersion(db, auth.storeId),
      count: catalogSize(db, auth.storeId),
    })
  }
  const sinceRaw = params.get("since")
  const since = sinceRaw === null ? undefined : Number(sinceRaw)
  return json(getCatalog(db, auth.storeId, Number.isFinite(since) ? since : undefined))
})

export const PUT = handle(async (req) => {
  const db = getDb()
  const auth = requireAuth(db, req, "admin")
  const body = await readBody<{ items: CatalogItem[] }>(req)
  return json(replaceCatalog(db, auth.storeId, body.items))
})
