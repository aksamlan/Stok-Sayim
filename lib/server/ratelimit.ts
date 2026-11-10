import { ApiError } from "./auth"

type Bucket = { count: number; resetAt: number }

const g = globalThis as typeof globalThis & { __stokRateLimits?: Map<string, Bucket> }

function buckets(): Map<string, Bucket> {
  if (!g.__stokRateLimits) g.__stokRateLimits = new Map()
  return g.__stokRateLimits
}

export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const map = buckets()
  const now = Date.now()
  const bucket = map.get(key)
  if (!bucket || bucket.resetAt <= now) {
    map.set(key, { count: 1, resetAt: now + windowMs })
    // Haritanın sınırsız büyümesini engelle
    if (map.size > 10000) {
      for (const [k, b] of map) if (b.resetAt <= now) map.delete(k)
    }
    return true
  }
  bucket.count++
  return bucket.count <= limit
}

export function rateLimitOrThrow(
  req: Request,
  name: string,
  limit = 10,
  windowMs = 60000
): void {
  const forwarded = req.headers.get("x-forwarded-for")
  const ip = forwarded ? forwarded.split(",")[0].trim() : "local"
  if (!checkRateLimit(`${name}:${ip}`, limit, windowMs)) {
    throw new ApiError(429, "Çok fazla deneme yapıldı, biraz bekleyip tekrar dene")
  }
}
