import { ApiError, requireAuth } from "@/lib/server/auth"
import { dashboard } from "@/lib/server/counts"
import { getDb } from "@/lib/server/db"
import { handle, json } from "@/lib/server/http"

export const GET = handle((req) => {
  const db = getDb()
  const auth = requireAuth(db, req, "admin")
  const params = new URL(req.url).searchParams
  const sessionId = params.get("sessionId")
  if (!sessionId) throw new ApiError(400, "sessionId gerekli")
  return json(
    dashboard(db, auth.storeId, sessionId, {
      filter: params.get("filter") === "all" ? "all" : "problems",
      search: params.get("search") ?? undefined,
      category: params.get("category") ?? undefined,
      page: Number(params.get("page") ?? 1) || 1,
      pageSize: 100,
    })
  )
})
