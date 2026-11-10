import { ApiError } from "./auth"
import { maybeCleanup } from "./cleanup"
import { getDb } from "./db"

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  })
}

export function handle(
  fn: (req: Request) => Promise<Response> | Response
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    try {
      // Hareketsiz mağaza temizliği: ucuz eşik kontrolü, 6 saatte bir çalışır,
      // isteği bekletmez.
      try {
        maybeCleanup(getDb())
      } catch {}
      return await fn(req)
    } catch (e) {
      if (e instanceof ApiError) return json({ error: e.message }, e.status)
      console.error("[api]", e)
      return json({ error: "Sunucu hatası" }, 500)
    }
  }
}

export async function readBody<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T
  } catch {
    throw new ApiError(400, "Geçersiz istek gövdesi")
  }
}
