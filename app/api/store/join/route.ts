import { getDb } from "@/lib/server/db"
import { handle, json, readBody } from "@/lib/server/http"
import { joinStore } from "@/lib/server/stores"

export const POST = handle(async (req) => {
  const body = await readBody<{
    code: string
    password: string
    counterName?: string
  }>(req)
  return json(joinStore(getDb(), body.code ?? "", body.password ?? "", body.counterName ?? ""))
})
