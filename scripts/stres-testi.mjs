#!/usr/bin/env node
// Stokzen STRES testi: yuk-testi.mjs'in ötesinde, ÇAKIŞMA ve GECİKME avcısı.
//  - 100.000 ürünlük katalog (spec üst sınırı)
//  - 10 sayımcı okuturken AYNI ANDA pano sorguları + tam dışa aktarma
//  - Aynı partinin 5 kopyasının AYNI ANDA gönderimi (çift sayım denemesi)
//  - Sayım sürerken katalog değişimi ve oturum kapatıp yenisini açma yarışı
//  - Gecikme yüzdelikleri (p50/p95/maks) ve 5xx avı
// Kullanım: node scripts/stres-testi.mjs   (BASE_URL ile hedef değiştirilebilir)

const BASE = process.env.BASE_URL ?? "http://localhost:3458"
const CATALOG_SIZE = Number(process.env.CATALOG_SIZE ?? 100000)
const COUNTERS = 10

let failures = 0
let serverErrors = 0
const latencies = { scan: [], dashboard: [], export: [] }

function check(cond, label, detail = "") {
  if (cond) console.log(`  ✔ ${label}`)
  else {
    failures++
    console.error(`  ✘ ${label} ${detail}`)
  }
}
const pct = (arr, p) => {
  if (arr.length === 0) return 0
  const s = [...arr].sort((a, b) => a - b)
  return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))])
}
const ms = (t) => `${Math.round(t)} ms`

async function api(path, { method = "GET", token, body, lat } = {}) {
  const t0 = performance.now()
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (lat) latencies[lat].push(performance.now() - t0)
  if (res.status >= 500) serverErrors++
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const err = new Error(`${method} ${path} -> ${res.status}: ${data?.error ?? "?"}`)
    err.status = res.status
    throw err
  }
  return data
}

let seq = 0
const ev = (sessionId, barcode, qty) => ({
  id: `st-${Date.now()}-${++seq}-${Math.random().toString(36).slice(2, 8)}`,
  sessionId,
  barcode,
  qty,
  createdAt: Date.now(),
})

async function main() {
  console.log(`\n=== STOKZEN STRES TESTİ ===\nHedef: ${BASE}\n`)

  // Kurulum
  const store = await api("/api/store", {
    method: "POST",
    body: {
      name: "Stres Testi Market",
      countPassword: "say1234",
      adminPassword: "admin1234",
      email: "stres@ornek.com",
      phone: "05550009988",
    },
  })
  const admin = store.token
  console.log(`[0] Mağaza: ${store.code}`)

  // [1] 100k katalog
  const items = Array.from({ length: CATALOG_SIZE }, (_, i) => ({
    barcode: String(8690000000000 + i),
    name: `Ürün ${i} ğüşİöç`,
    category: `Kategori ${i % 30}`,
    expected: i % 50,
  }))
  let t = performance.now()
  const up = await api("/api/catalog", { method: "PUT", token: admin, body: { items } })
  const uploadMs = performance.now() - t
  t = performance.now()
  const cat = await api("/api/catalog", { token: admin })
  const downloadMs = performance.now() - t
  console.log(
    `[1] ${CATALOG_SIZE.toLocaleString("tr-TR")} ürün: yükleme ${ms(uploadMs)}, indirme ${ms(downloadMs)} (${(JSON.stringify(cat).length / 1e6).toFixed(1)} MB)`
  )
  check(up.count === CATALOG_SIZE, `katalog ${CATALOG_SIZE.toLocaleString("tr-TR")} satır`)

  const s1 = await api("/api/sessions", { method: "POST", token: admin, body: { name: "Stres S1" } })
  const counters = []
  for (let i = 1; i <= COUNTERS; i++) {
    counters.push({
      name: `Stresçi${i}`,
      ...(await api("/api/store/join", {
        method: "POST",
        body: { code: store.code, password: "say1234", counterName: `Stresçi${i}`, pin: "1111" },
      })),
    })
  }

  // [2] Birleşik yük: 10 sayımcı × 20 parti × 250 olay, AYNI ANDA pano + export
  const expected = new Map() // barcode -> qty (S1)
  const perCounter = new Map()
  const makeBatch = (counterIdx) => {
    const batch = []
    for (let k = 0; k < 250; k++) {
      const idx =
        Math.random() < 0.6 ? Math.floor(Math.random() * 8000) : Math.floor(Math.random() * CATALOG_SIZE)
      const barcode = Math.random() < 0.05 ? `99${100000 + Math.floor(Math.random() * 300)}` : String(8690000000000 + idx)
      const qty = 1 + Math.floor(Math.random() * 4)
      batch.push(ev(s1.id, barcode, qty))
      expected.set(barcode, (expected.get(barcode) ?? 0) + qty)
      const cn = counters[counterIdx].name
      perCounter.set(cn, (perCounter.get(cn) ?? 0) + qty)
    }
    return batch
  }

  let accepted = 0
  let polling = true
  const poller = (async () => {
    while (polling) {
      try {
        await api(`/api/dashboard?sessionId=${s1.id}&filter=problems&page=1`, {
          token: admin,
          lat: "dashboard",
        })
      } catch {}
      await new Promise((r) => setTimeout(r, 400))
    }
  })()
  const exporter = (async () => {
    for (let round = 0; round < 2; round++) {
      let page = 1
      let total = Infinity
      let got = 0
      while (got < total) {
        try {
          const ex = await api(`/api/dashboard/export?sessionId=${s1.id}&page=${page}`, {
            token: admin,
            lat: "export",
          })
          total = ex.rowTotal
          got += ex.rows.length
          if (ex.rows.length === 0) break
          page++
        } catch {
          break
        }
      }
    }
  })()

  t = performance.now()
  await Promise.all(
    counters.map(async (c, ci) => {
      for (let b = 0; b < 20; b++) {
        const batch = makeBatch(ci)
        const r = await api("/api/scan", {
          method: "POST",
          token: c.token,
          body: { events: batch },
          lat: "scan",
        })
        accepted += r.accepted
      }
    })
  )
  const scanMs = performance.now() - t
  polling = false
  await Promise.all([poller, exporter])
  const totalEvents = COUNTERS * 20 * 250
  console.log(
    `[2] ${totalEvents.toLocaleString("tr-TR")} olay + eşzamanlı pano/export: ${ms(scanMs)} (${Math.round((totalEvents / scanMs) * 1000).toLocaleString("tr-TR")} olay/sn)`
  )
  check(accepted === totalEvents, `tümü kabul (${accepted}/${totalEvents})`)

  // [3] Paralel çift gönderim: aynı 250'lik parti 5 kopya AYNI ANDA
  const dupBatch = makeBatch(0)
  const results = await Promise.all(
    Array.from({ length: 5 }, () =>
      api("/api/scan", { method: "POST", token: counters[0].token, body: { events: dupBatch } }).then(
        (r) => r.accepted,
        () => -1
      )
    )
  )
  const dupAccepted = results.reduce((a, b) => a + Math.max(0, b), 0)
  console.log(`[3] Aynı partinin 5 paralel kopyası`)
  check(results.every((r) => r >= 0), "hiçbir kopya hata vermedi", JSON.stringify(results))
  check(dupAccepted === 250, `toplam kabul tam 250 (çift sayım yok, dağılım: ${results.join("+")})`)

  // [4] Sayım sürerken katalog değişimi
  const catScan = (async () => {
    for (let b = 0; b < 6; b++) {
      const batch = makeBatch(1)
      const r = await api("/api/scan", { method: "POST", token: counters[1].token, body: { events: batch } })
      accepted += r.accepted
    }
  })()
  const catPut = api("/api/catalog", { method: "PUT", token: admin, body: { items } })
  await Promise.all([catScan, catPut])
  const size = await api("/api/catalog?countOnly=1", { token: admin })
  console.log(`[4] Sayım sürerken katalog yeniden yüklendi`)
  check(size.count === CATALOG_SIZE, "katalog bütün, hata yok")

  // [5] Oturum rotasyonu yarışı: sayımcılar basarken kapat + yeni aç
  let rot409 = 0
  let rotOther = 0
  const rotScan = Promise.all(
    counters.slice(2, 7).map(async (c) => {
      for (let b = 0; b < 8; b++) {
        try {
          const batch = Array.from({ length: 50 }, () => {
            const e = ev(s1.id, String(8690000000000 + Math.floor(Math.random() * 1000)), 1)
            return e
          })
          const r = await api("/api/scan", { method: "POST", token: c.token, body: { events: batch } })
          // kabul edilenler S1'e işlendi (rotasyondan önce yetişenler)
          for (const e of batch) expected.set(e.barcode, (expected.get(e.barcode) ?? 0) + e.qty * (r.accepted > 0 ? 1 : 0))
          if (r.accepted > 0) {
            const cn = c.name
            perCounter.set(cn, (perCounter.get(cn) ?? 0) + batch.length * 1 * (r.accepted / batch.length))
          }
        } catch (e) {
          if (e.status === 409) rot409++
          else rotOther++
        }
        await new Promise((r) => setTimeout(r, 10))
      }
    })
  )
  await new Promise((r) => setTimeout(r, 120))
  await api("/api/sessions", { method: "PATCH", token: admin, body: { id: s1.id, status: "closed" } })
  const s2 = await api("/api/sessions", { method: "POST", token: admin, body: { name: "Stres S2" } })
  await rotScan
  console.log(`[5] Rotasyon yarışı: ${rot409} parti beklendiği gibi 409 aldı`)
  check(rotOther === 0, "409 dışında hata yok", `(diğer: ${rotOther})`)

  // [6] S2 kesin doğrulama: bilinen küçük küme
  const s2Expected = new Map()
  for (const [i, c] of counters.entries()) {
    const batch = []
    for (let k = 0; k < 20; k++) {
      const barcode = String(8690000000000 + i * 100 + k)
      batch.push(ev(s2.id, barcode, 2))
      s2Expected.set(barcode, (s2Expected.get(barcode) ?? 0) + 2)
    }
    await api("/api/scan", { method: "POST", token: c.token, body: { events: batch } })
  }
  const d2 = await api(`/api/dashboard?sessionId=${s2.id}&filter=all&page=1`, { token: admin })
  const s2Total = [...s2Expected.values()].reduce((a, b) => a + b, 0)
  console.log(`[6] Yeni oturum (S2) doğrulaması`)
  check(d2.totals.totalQty === s2Total, `S2 toplamı tam ${s2Total}`, `(sunucu: ${d2.totals.totalQty})`)
  check(d2.byCounter.length === COUNTERS, `S2'de ${COUNTERS} sayımcı`)

  // [7] Hız limiti düzgün 429 veriyor (500 değil)
  let got429 = false
  for (let i = 0; i < 5; i++) {
    try {
      await api("/api/store/dogrulama", { method: "POST", body: { email: "a@b.com" } })
    } catch (e) {
      if (e.status === 429) got429 = true
      else if (e.status >= 500) serverErrors++
    }
  }
  console.log(`[7] Doğrulama ucu hız limiti`)
  check(got429, "4.+ istekte 429 (sunucu hatası değil)")

  // Rapor
  console.log(`\n=== GECİKMELER (eşzamanlı yük altında) ===`)
  for (const [k, v] of Object.entries(latencies)) {
    if (v.length === 0) continue
    console.log(
      `${k.padEnd(10)} p50 ${pct(v, 50)} ms · p95 ${pct(v, 95)} ms · maks ${pct(v, 100)} ms · n=${v.length}`
    )
  }
  console.log(`\n5xx sunucu hatası: ${serverErrors}`)
  check(serverErrors === 0, "hiç 5xx yok")
  console.log(`Test mağazası: ${store.code} (say1234 / admin1234) — /yonetim'den silebilirsin.`)
  if (failures === 0) console.log(`\n✅ STRES TESTİ TEMİZ GEÇTİ\n`)
  else {
    console.error(`\n❌ ${failures} kontrol başarısız\n`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error("Stres testi durdu:", e.message)
  process.exit(1)
})
