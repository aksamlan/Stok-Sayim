import { afterEach, expect, test, vi } from "vitest"
import {
  apiJoinStore,
  apiSessions,
  AuthExpiredError,
} from "../../lib/store-client/api"

afterEach(() => {
  vi.unstubAllGlobals()
})

function stub401(body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status: 401 }))
  )
}

test("401 on login (no token) surfaces the server message", async () => {
  stub401({ error: "Kod veya şifre hatalı" })
  await expect(
    apiJoinStore({ code: "ABC123", password: "x", counterName: "Ali" })
  ).rejects.toThrow("Kod veya şifre hatalı")
})

test("401 on an authed call maps to AuthExpiredError", async () => {
  stub401({ error: "Oturum geçersiz" })
  await expect(apiSessions("some-token")).rejects.toBeInstanceOf(AuthExpiredError)
})
