import { afterAll, beforeAll, expect, test } from "vitest"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

// SMTP açıkken /api/store rotası: kodsuz mağaza AÇILMAZ, doğru kodla açılır,
// aynı kod ikinci kez KULLANILAMAZ. (Kilidin yük taşıyan davranışı.)
let POST: (req: Request) => Promise<Response>
let getDb: typeof import("../../lib/server/db").getDb
let createEmailCode: typeof import("../../lib/server/verify").createEmailCode

beforeAll(async () => {
  process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "stok-route-"))
  // SMTP "ayarlı" ama ulaşılamaz: hoş geldin maili anında başarısız olur (sorun değil)
  process.env.SMTP_HOST = "127.0.0.1"
  process.env.SMTP_PORT = "1"
  ;({ getDb } = await import("../../lib/server/db"))
  ;({ createEmailCode } = await import("../../lib/server/verify"))
  ;({ POST } = await import("../../app/api/store/route"))
})

afterAll(() => {
  delete process.env.SMTP_HOST
  delete process.env.SMTP_PORT
})

const body = (extra: Record<string, unknown>) =>
  new Request("http://x/api/store", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Rota Test",
      countPassword: "say123",
      adminPassword: "admin123",
      email: "rota@ornek.com",
      phone: "05551112233",
      ...extra,
    }),
  })

test("without a verification code the store is NOT created", async () => {
  const res = await POST(body({}))
  expect(res.status).toBe(400)
})

test("with the correct code it is created; the same code cannot create a second store", async () => {
  const { token, code } = createEmailCode(getDb(), "rota@ornek.com")
  const ok = await POST(body({ verifyToken: token, verifyCode: code }))
  expect(ok.status).toBe(200)
  const again = await POST(body({ verifyToken: token, verifyCode: code }))
  expect(again.status).toBe(400)
})
