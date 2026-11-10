// Stokzen service worker: uygulama kabuğunu önbelleğe alır ki internet
// kesildiğinde sayfa yenilense bile sayım ekranı açılabilsin.
// API istekleri ASLA önbelleğe alınmaz.
const CACHE = "stokzen-v1"

self.addEventListener("install", () => {
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      await self.clients.claim()
    })()
  )
})

self.addEventListener("fetch", (event) => {
  const req = event.request
  if (req.method !== "GET") return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith("/api/")) return

  // Değişmez statik dosyalar: önce önbellek
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req)
        if (cached) return cached
        const res = await fetch(req)
        if (res.ok) {
          const cache = await caches.open(CACHE)
          cache.put(req, res.clone())
        }
        return res
      })()
    )
    return
  }

  // Sayfa gezinmeleri: önce ağ, çevrimdışıysa önbellek
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req)
          if (res.ok) {
            const cache = await caches.open(CACHE)
            cache.put(req, res.clone())
          }
          return res
        } catch {
          const cached = await caches.match(req)
          if (cached) return cached
          const fallback = await caches.match("/magaza/sayim")
          if (fallback) return fallback
          return new Response("Çevrimdışı", { status: 503 })
        }
      })()
    )
  }
})
