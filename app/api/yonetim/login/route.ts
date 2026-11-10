import { getDb } from "@/lib/server/db"
import { handle, json, readBody } from "@/lib/server/http"
import { rateLimitOrThrow } from "@/lib/server/ratelimit"
import { superLogin } from "@/lib/server/superadmin"

export const POST = handle(async (req) => {
  rateLimitOrThrow(req, "super-login", 5, 60000)
  const body = await readBody<{ password: string }>(req)
  return json(superLogin(getDb(), body.password ?? ""))
})
