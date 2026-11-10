import { getDb } from "@/lib/server/db"
import { handle, json, readBody } from "@/lib/server/http"
import { rateLimitOrThrow } from "@/lib/server/ratelimit"
import { joinStore } from "@/lib/server/stores"

export const POST = handle(async (req) => {
  // Cloudflare arkasında tüm mağaza personeli aynı edge IP'den görünebilir;
  // 10 kişilik ekip aynı dakikada girerken 11.'yi engellememek için 30/dk.
  rateLimitOrThrow(req, "join", 30, 60000)
  const body = await readBody<{
    code: string
    password: string
    counterName?: string
    pin?: string
  }>(req)
  return json(
    joinStore(
      getDb(),
      body.code ?? "",
      body.password ?? "",
      body.counterName ?? "",
      body.pin ?? ""
    )
  )
})
