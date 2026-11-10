import { getDb } from "@/lib/server/db"
import { handle, json, readBody } from "@/lib/server/http"
import { sendMail } from "@/lib/server/mail"
import { rateLimitOrThrow } from "@/lib/server/ratelimit"
import { createStore, joinStore } from "@/lib/server/stores"

export const POST = handle(async (req) => {
  rateLimitOrThrow(req, "store-create", 5, 60000)
  const body = await readBody<{
    name: string
    countPassword: string
    adminPassword: string
    email?: string
  }>(req)
  const db = getDb()
  const { code } = createStore(
    db,
    body.name ?? "",
    body.countPassword ?? "",
    body.adminPassword ?? "",
    body.email
  )
  const joined = joinStore(db, code, body.adminPassword, "", "")
  // Hoş geldin maili (SMTP ayarlıysa); başarısızlık kurulumu etkilemez.
  void sendMail(
    body.email?.trim() || null,
    `Stokzen: "${joined.storeName}" mağazan hazır`,
    `Mağazan kuruldu!\n\nMağaza kodu: ${code}\n\nSayımcılar bu kod + sayım ` +
      `şifresiyle, sen yönetici şifresiyle girersin. Kodu ve şifreleri güvenli ` +
      `bir yerde sakla.\n\nNot: Uzun süre kullanılmayan mağazalar, önceden ` +
      `e-posta ile uyarılarak otomatik silinir.`
  )
  return json({ code, ...joined })
})
