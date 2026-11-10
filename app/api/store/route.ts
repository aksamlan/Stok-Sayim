import { getDb } from "@/lib/server/db"
import { handle, json, readBody } from "@/lib/server/http"
import { createStore, joinStore } from "@/lib/server/stores"

export const POST = handle(async (req) => {
  const body = await readBody<{
    name: string
    countPassword: string
    adminPassword: string
  }>(req)
  const db = getDb()
  const { code } = createStore(
    db,
    body.name ?? "",
    body.countPassword ?? "",
    body.adminPassword ?? ""
  )
  const joined = joinStore(db, code, body.adminPassword, "")
  return json({ code, ...joined })
})
