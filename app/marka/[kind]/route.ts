import { getDb } from "@/lib/server/db"
import { isBrandKind, readBrand } from "@/lib/server/brand"

// Herkese açık (giriş gerektirmez): favicon/logo tarayıcıdan oturumsuz istenir.
export async function GET(req: Request, ctx: { params: Promise<{ kind: string }> }) {
  const { kind } = await ctx.params
  if (!isBrandKind(kind)) return new Response("Not found", { status: 404 })
  const { body, mime, etag } = readBrand(getDb(), kind)
  const headers = {
    "Content-Type": mime,
    ETag: etag,
    // 1 dk önbellek + ETag doğrulaması: yönetimden değişince hızla yansır.
    "Cache-Control": "public, max-age=60, must-revalidate",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  }
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers })
  return new Response(new Uint8Array(body), { headers })
}
