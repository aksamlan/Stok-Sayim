import { ApiError } from "./auth"

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
