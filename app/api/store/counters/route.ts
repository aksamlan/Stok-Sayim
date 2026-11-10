import { getDb } from "@/lib/server/db"
import { handle, json, readBody } from "@/lib/server/http"
import { rateLimitOrThrow } from "@/lib/server/ratelimit"
import { listCounterNamesForJoin } from "@/lib/server/stores"

export const POST = handle(async (req) => {
  rateLimitOrThrow(req, "join-names", 30, 60000)
  const body = await readBody<{ code: string; password: string }>(req)
  return json({
    counters: listCounterNamesForJoin(getDb(), body.code ?? "", body.password ?? ""),
  })
})
