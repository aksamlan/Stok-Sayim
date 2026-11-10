import { getDb } from "@/lib/server/db"
import { handle, json, readBody } from "@/lib/server/http"
import { rateLimitOrThrow } from "@/lib/server/ratelimit"
import { joinStore } from "@/lib/server/stores"

export const POST = handle(async (req) => {
  rateLimitOrThrow(req, "join", 10, 60000)
  const body = await readBody<{
    code: string
    password: string
    counterName?: string
  }>(req)
  return json(joinStore(getDb(), body.code ?? "", body.password ?? "", body.counterName ?? ""))
})
