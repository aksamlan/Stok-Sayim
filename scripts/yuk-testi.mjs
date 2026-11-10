#!/usr/bin/env node
// Stokzen yük testi: 50k ürünlük katalog + 10 eş zamanlı sayımcı + ~30k okutma,
// ardından sunucudaki birleşik sonuçların BİREBİR doğrulanması.
// Kullanım: node scripts/yuk-testi.mjs            (varsayılan http://localhost:3458)
//           BASE_URL=https://stok.alan.com node scripts/yuk-testi.mjs
// Not: test sonunda mağaza silinmez; kod ve şifreler raporda yazar.

const BASE = process.env.BASE_URL ?? "http://localhost:3458"
const CATALOG_SIZE = Number(process.env.CATALOG_SIZE ?? 50000)
const COUNTERS = Number(process.env.COUNTERS ?? 10)
const EVENTS_PER_COUNTER = Number(process.env.EVENTS_PER_COUNTER ?? 3000)
const BATCH = 500

const now = () => performance.now()
const ms = (t) => `${Math.round(t)} ms`

let failures = 0
function check(cond, label, detail = "") {
  if (cond) {
    console.log(`  ✔ ${label}`)
  } else {
    failures++
    console.error(`  ✘ ${label} ${detail}`)
  }
}

async function api(path, { method = "GET", token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const err = new Error(`${method} ${path} -> ${res.status}: ${data?.error ?? "?"}`)
    err.status = res.status
    throw err
  }
  return data
}

// Basit deterministik RNG (tekrar üretilebilir test)
let seed = 42
function rnd() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff
  return seed / 0x7fffffff
}
const randInt = (n) => Math.floor(rnd() * n)

async function main() {
  console.log(`\n=== STOKZEN YÜK TESTİ ===`)
  console.log(`Hedef: ${BASE}`)
  console.log(
    `Katalog: ${CATALOG_SIZE.toLocaleString("tr-TR")} ürün · Sayımcı: ${COUNTERS} · Okutma: ${(
      COUNTERS * EVENTS_PER_COUNTER
    ).toLocaleString("tr-TR")}\n`
  )

  // 1) Mağaza kur
  let t = now()
  const store = await api("/api/store", {
    method: "POST",
    body: {
      name: "Yük Testi Market",
      countPassword: "say1234",
      adminPassword: "admin1234",
      email: "yuk-testi@ornek.com",
    },
  })
  const admin = store.token
  console.log(`[1] Mağaza kuruldu: kod ${store.code} (${ms(now() - t)})`)

  // 2) 50k katalog yükle
  const items = Array.from({ length: CATALOG_SIZE }, (_, i) => ({
    barcode: String(8690000000000 + i),
    name: `Ürün ${i} ğüşİöç`,
    category: `Kategori ${i % 25}`,
    expected: i % 40 === 0 ? null : i % 37,
  }))
  t = now()
  const up = await api("/api/catalog", { method: "PUT", token: admin, body: { items } })
  const uploadMs = now() - t
  console.log(`[2] Katalog yüklendi: ${up.count.toLocaleString("tr-TR")} ürün, ${ms(uploadMs)}`)
  check(up.count === CATALOG_SIZE, `katalog sayısı ${CATALOG_SIZE}`)

  // 3) Katalog indirme süresi (telefonların ilk açılışı)
  t = now()
  const cat = await api("/api/catalog", { token: admin })
  const downloadMs = now() - t
  const catBytes = JSON.stringify(cat).length
  console.log(
    `[3] Katalog indirme: ${cat.items.length.toLocaleString("tr-TR")} ürün, ${(catBytes / 1e6).toFixed(1)} MB, ${ms(downloadMs)}`
  )
  t = now()
  const unchanged = await api(`/api/catalog?since=${cat.version}`, { token: admin })
  check(unchanged.unchanged === true, `sürüm değişmeyince indirme atlanıyor (${ms(now() - t)})`)

  // 4) Kapalı sayım reddi testi (önce geçici oturum)
  const tmp = await api("/api/sessions", { method: "POST", token: admin, body: { name: "Kapalı Test" } })
  await api("/api/scan", {
    method: "POST",
    token: admin,
    body: {
      events: [{ id: "tmp-1", sessionId: tmp.id, barcode: "8690000000001", qty: 1, createdAt: Date.now() }],
    },
  })
  await api("/api/sessions", { method: "PATCH", token: admin, body: { id: tmp.id, status: "closed" } })
  let got409 = false
  try {
    await api("/api/scan", {
      method: "POST",
      token: admin,
      body: {
        events: [{ id: "tmp-2", sessionId: tmp.id, barcode: "8690000000001", qty: 1, createdAt: Date.now() }],
      },
    })
  } catch (e) {
    got409 = e.status === 409
  }
  console.log(`[4] Kapalı sayım koruması`)
  check(got409, "kapalı sayıma okutma 409 ile reddediliyor")

  // 5) Ana sayım + 10 sayımcı girişi
  const session = await api("/api/sessions", { method: "POST", token: admin, body: { name: "Yük Testi Sayımı" } })
  const counters = []
  for (let i = 1; i <= COUNTERS; i++) {
    const j = await api("/api/store/join", {
      method: "POST",
      body: { code: store.code, password: "say1234", counterName: `Sayımcı${i}`, pin: "1111" },
    })
    counters.push({ name: `Sayımcı${i}`, token: j.token })
  }
  console.log(`[5] ${COUNTERS} sayımcı giriş yaptı, sayım açıldı: ${session.id.slice(0, 8)}…`)

  // 6) Olay üretimi (beklenen sonuçları yerelde de hesapla)
  const expectedByBarcode = new Map() // barcode -> toplam
  const expectedByCounter = new Map() // counter -> toplam adet
  const unknownPool = Array.from({ length: 400 }, (_, i) => `99${100000 + i}`)
  const allBatches = [] // [counterIdx, events[]]

  for (const [ci, c] of counters.entries()) {
    const myAdds = [] // negatif delta için geri alınabilir eklemeler
    const events = []
    for (let k = 0; k < EVENTS_PER_COUNTER; k++) {
      let barcode
      if (rnd() < 0.1) {
        barcode = unknownPool[randInt(unknownPool.length)]
      } else {
        // kasıtlı çakışma: herkes aynı 5000'lik bölgeden de okutur
        const idx = rnd() < 0.5 ? randInt(5000) : randInt(CATALOG_SIZE)
        barcode = String(8690000000000 + idx)
      }
      const qty = 1 + randInt(5)
      events.push({ id: crypto.randomUUID(), sessionId: session.id, barcode, qty, createdAt: Date.now() })
      myAdds.push({ barcode, qty })
      expectedByBarcode.set(barcode, (expectedByBarcode.get(barcode) ?? 0) + qty)
      expectedByCounter.set(c.name, (expectedByCounter.get(c.name) ?? 0) + qty)
    }
    // her sayımcı 20 "silme" (negatif delta) yapar
    for (let d = 0; d < 20; d++) {
      const pick = myAdds[randInt(myAdds.length)]
      events.push({
        id: crypto.randomUUID(),
        sessionId: session.id,
        barcode: pick.barcode,
        qty: -pick.qty,
        createdAt: Date.now(),
      })
      expectedByBarcode.set(pick.barcode, expectedByBarcode.get(pick.barcode) - pick.qty)
      expectedByCounter.set(c.name, expectedByCounter.get(c.name) - pick.qty)
      pick.qty = 0 // aynı eklemeyi iki kez geri alma
    }
    for (let i = 0; i < events.length; i += BATCH) {
      allBatches.push([ci, events.slice(i, i + BATCH)])
    }
  }

  // 7) 10 sayımcı AYNI ANDA gönderiyor
  t = now()
  let accepted = 0
  const firstBatchOf0 = allBatches.find(([ci]) => ci === 0)[1]
  await Promise.all(
    counters.map(async (c, ci) => {
      for (const [bi, batch] of allBatches) {
        if (bi !== ci) continue
        const r = await api("/api/scan", { method: "POST", token: c.token, body: { events: batch } })
        accepted += r.accepted
      }
    })
  )
  const scanMs = now() - t
  const totalEvents = allBatches.reduce((s, [, b]) => s + b.length, 0)
  console.log(
    `[6] ${totalEvents.toLocaleString("tr-TR")} olay, ${COUNTERS} paralel istemci: ${ms(scanMs)} (${Math.round(
      (totalEvents / scanMs) * 1000
    ).toLocaleString("tr-TR")} olay/sn)`
  )
  check(accepted === totalEvents, `tüm olaylar kabul edildi (${accepted}/${totalEvents})`)

  // 8) İdempotentlik: ilk batch'i aynen tekrar gönder (zaman aşımı sonrası retry senaryosu)
  const again = await api("/api/scan", {
    method: "POST",
    token: counters[0].token,
    body: { events: firstBatchOf0 },
  })
  console.log(`[7] Çift gönderim (retry) testi`)
  check(again.accepted === 0, "tekrar gönderilen batch çift sayılmadı (accepted=0)")

  // 9) Pano sorgu süreleri
  const dashTimes = []
  let dash
  for (let i = 0; i < 5; i++) {
    t = now()
    dash = await api(
      `/api/dashboard?sessionId=${session.id}&filter=problems&page=1`,
      { token: admin }
    )
    dashTimes.push(now() - t)
  }
  const avgDash = dashTimes.reduce((a, b) => a + b, 0) / dashTimes.length
  console.log(`[8] Pano sorgusu (50k katalog + ${totalEvents.toLocaleString("tr-TR")} olay): ort ${ms(avgDash)}`)

  // 10) Doğrulama: beklenen toplamlar
  const expTotalQty = [...expectedByBarcode.values()].reduce((a, b) => a + b, 0)
  // "Sayılan çeşit" yalnız katalogdaki barkodları sayar (listede olmayanlar hariç)
  const expDistinct = [...expectedByBarcode.entries()].filter(
    ([b, v]) => v !== 0 && b.startsWith("869")
  ).length
  const expUnknown = unknownPool.filter((b) => (expectedByBarcode.get(b) ?? 0) !== 0).length
  console.log(`[9] Toplamların doğrulanması`)
  check(dash.totals.totalQty === expTotalQty, `toplam adet = ${expTotalQty.toLocaleString("tr-TR")}`, `(sunucu: ${dash.totals.totalQty})`)
  check(dash.totals.distinctCounted === expDistinct, `sayılan farklı barkod = ${expDistinct.toLocaleString("tr-TR")}`, `(sunucu: ${dash.totals.distinctCounted})`)
  check(dash.totals.counters === COUNTERS, `sayımcı sayısı = ${COUNTERS}`, `(sunucu: ${dash.totals.counters})`)
  check(dash.totals.unknownCount === expUnknown, `listede olmayan barkod = ${expUnknown}`, `(sunucu: ${dash.totals.unknownCount})`)
  check(dash.totals.catalogCount === CATALOG_SIZE, `katalog sayısı = ${CATALOG_SIZE}`)

  for (const bc of dash.byCounter) {
    const exp = expectedByCounter.get(bc.counter)
    if (bc.qty !== exp) {
      failures++
      console.error(`  ✘ ${bc.counter}: beklenen ${exp}, sunucu ${bc.qty}`)
    }
  }
  check(dash.byCounter.length === COUNTERS, `kişi kırılımı ${COUNTERS} satır ve toplamlar birebir doğru`)

  // 11) TAM doğrulama: dışa aktarma sayfalarıyla HER barkodu karşılaştır
  t = now()
  const serverByBarcode = new Map()
  let page = 1
  let rowTotal = Infinity
  let fetched = 0
  while (fetched < rowTotal) {
    const ex = await api(`/api/dashboard/export?sessionId=${session.id}&page=${page}`, { token: admin })
    rowTotal = ex.rowTotal
    for (const r of ex.rows) serverByBarcode.set(r.barcode, r.counted)
    fetched += ex.rows.length
    if (ex.rows.length === 0) break
    page++
  }
  const exportMs = now() - t
  let mismatch = 0
  for (const [barcode, exp] of expectedByBarcode) {
    const server = serverByBarcode.get(barcode) ?? 0
    if (server !== exp) {
      if (mismatch < 5) console.error(`  ✘ ${barcode}: beklenen ${exp}, sunucu ${server}`)
      mismatch++
    }
  }
  console.log(
    `[10] Tam dışa aktarma: ${rowTotal.toLocaleString("tr-TR")} satır / ${page} sayfa, ${ms(exportMs)}`
  )
  check(mismatch === 0, `her barkodun birleşik toplamı birebir doğru (${expectedByBarcode.size.toLocaleString("tr-TR")} barkod)`)
  if (mismatch > 0) failures += mismatch

  // Özet
  console.log(`\n=== SONUÇ ===`)
  console.log(`Katalog yükleme:  ${ms(uploadMs)} (${CATALOG_SIZE.toLocaleString("tr-TR")} ürün)`)
  console.log(`Katalog indirme:  ${ms(downloadMs)} (${(catBytes / 1e6).toFixed(1)} MB)`)
  console.log(`Okutma hızı:      ${Math.round((totalEvents / scanMs) * 1000).toLocaleString("tr-TR")} olay/sn (${COUNTERS} paralel)`)
  console.log(`Pano sorgusu:     ort ${ms(avgDash)}`)
  console.log(`Test mağazası:    kod ${store.code} · sayım şifresi say1234 · yönetici admin1234`)
  console.log("NOT: Gerçek sunucuda koştuysan test mağazasını /yonetim panelinden silmeyi unutma.")
  if (failures === 0) {
    console.log(`\n✅ TÜM KONTROLLER GEÇTİ — veri birebir tutarlı.\n`)
  } else {
    console.error(`\n❌ ${failures} KONTROL BAŞARISIZ!\n`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error("Yük testi hata ile durdu:", e.message)
  process.exit(1)
})
