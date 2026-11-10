import { ApiError } from "@/lib/server/auth"
import { getDb } from "@/lib/server/db"
import { handle, json, readBody } from "@/lib/server/http"
import { mailConfigured, sendMail } from "@/lib/server/mail"
import { consumeEmailCode, normalizePhone } from "@/lib/server/verify"
import { rateLimitOrThrow } from "@/lib/server/ratelimit"
import { createStore, joinStore } from "@/lib/server/stores"

export const POST = handle(async (req) => {
  rateLimitOrThrow(req, "store-create", 5, 60000)
  const body = await readBody<{
    name: string
    countPassword: string
    adminPassword: string
    email?: string
    phone?: string
    verifyToken?: string
    verifyCode?: string
  }>(req)
  const db = getDb()
  // Kötüye kullanım önleme: e-posta + telefon zorunlu; SMTP ayarlıysa
  // e-postaya gönderilen 6 haneli kod doğrulanmadan mağaza AÇILMAZ.
  const email = (body.email ?? "").trim()
  if (!email) throw new ApiError(400, "E-posta adresi gerekli")
  const phone = normalizePhone(body.phone ?? "")
  if (!phone) throw new ApiError(400, "Geçerli bir telefon numarası gir (örn. 0555 111 22 33)")
  let emailVerified = false
  if (mailConfigured()) {
    // consumeEmailCode TEK KULLANIMLIKTIR: aynı kod ikinci mağaza açamaz.
    if (
      !body.verifyToken ||
      !body.verifyCode ||
      !consumeEmailCode(db, body.verifyToken, email, body.verifyCode)
    ) {
      throw new ApiError(
        400,
        "E-posta doğrulama kodu hatalı, süresi dolmuş ya da zaten kullanılmış"
      )
    }
    emailVerified = true
  }
  const { code } = createStore(
    db,
    body.name ?? "",
    body.countPassword ?? "",
    body.adminPassword ?? "",
    email,
    phone
  )
  if (emailVerified) {
    db.prepare("UPDATE stores SET email_verified_at = ? WHERE code = ?").run(
      Date.now(),
      code
    )
  }
  const joined = joinStore(db, code, body.adminPassword, "", "")
  // Hoş geldin maili (SMTP ayarlıysa); başarısızlık kurulumu etkilemez.
  void sendMail(
    email,
    `Stokzen: "${joined.storeName}" mağazan hazır`,
    `Mağazan kuruldu!\n\nMağaza kodu: ${code}\n\nSayımcılar bu kod + sayım ` +
      `şifresiyle, sen yönetici şifresiyle girersin. Kodu ve şifreleri güvenli ` +
      `bir yerde sakla.\n\nNot: Uzun süre kullanılmayan mağazalar, önceden ` +
      `e-posta ile uyarılarak otomatik silinir.`
  )
  return json({ code, ...joined })
})
