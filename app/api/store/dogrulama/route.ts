import { ApiError } from "@/lib/server/auth"
import { getDb } from "@/lib/server/db"
import { handle, json, readBody } from "@/lib/server/http"
import { mailConfigured, sendMail } from "@/lib/server/mail"
import { rateLimitOrThrow } from "@/lib/server/ratelimit"
import { createEmailCode } from "@/lib/server/verify"

// Mağaza kurulumunun 1. adımı: e-postaya 6 haneli doğrulama kodu gönderir.
// SMTP ayarlı değilse doğrulama atlanır (required:false) — uygulama yine çalışır.
export const POST = handle(async (req) => {
  rateLimitOrThrow(req, "verify-mail", 3, 60000)
  const body = await readBody<{ email: string }>(req)
  const email = (body.email ?? "").trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError(400, "Geçerli bir e-posta adresi gir")
  }
  if (!mailConfigured()) {
    return json({ required: false })
  }
  const db = getDb()
  const { token, code } = createEmailCode(db, email)
  const sent = await sendMail(
    email,
    "Stokzen doğrulama kodun",
    `Mağaza kurulumu için doğrulama kodun: ${code}\n\n` +
      `Kod 15 dakika geçerlidir. Bu isteği sen yapmadıysan bu e-postayı yok say.`
  )
  if (!sent) {
    throw new ApiError(502, "Doğrulama e-postası gönderilemedi, birazdan tekrar dene")
  }
  return json({ required: true, token })
})
