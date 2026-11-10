import { AuthExpiredError, apiGetCatalog, apiPostScan } from "./api"
import {
  idbBulkPut,
  idbClear,
  idbDelete,
  idbGet,
  idbGetAll,
  idbPut,
  openIdb,
} from "./idb"
import type {
  CatalogEntry,
  CatalogItem,
  QueuedEvent,
  StoreAuth,
  SyncState,
} from "./types"

type MineRow = {
  key: string
  sessionId: string
  barcode: string
  qty: number
  lastAt: number
}

export async function ensureCatalog(
  auth: StoreAuth,
  onProgress?: (msg: string) => void
): Promise<Map<string, CatalogEntry>> {
  const db = await openIdb(auth.storeId)
  const versionRow = await idbGet<{ key: string; value: number }>(db, "meta", "catalogVersion")
  const cachedVersion = versionRow?.value
  let items: CatalogItem[] | null = null
  try {
    onProgress?.("Katalog kontrol ediliyor...")
    const res = await apiGetCatalog(auth.token, cachedVersion)
    if (!res.unchanged && res.items) {
      onProgress?.(`Katalog indiriliyor (${res.items.length} ürün)...`)
      await idbClear(db, "catalog")
      await idbBulkPut(db, "catalog", res.items)
      await idbPut(db, "meta", { key: "catalogVersion", value: res.version })
      items = res.items
    }
  } catch (e) {
    if (e instanceof AuthExpiredError) throw e
    // Çevrimdışı: önbellekten devam
  }
  if (!items) {
    onProgress?.("Katalog önbellekten yükleniyor...")
    items = await idbGetAll<CatalogItem>(db, "catalog")
  }
  const map = new Map<string, CatalogEntry>()
  for (const item of items) {
    map.set(item.barcode, {
      name: item.name,
      category: item.category,
      expected: item.expected,
    })
  }
  return map
}

export async function rememberSession(storeId: string, sessionId: string, name: string) {
  const db = await openIdb(storeId)
  await idbPut(db, "meta", { key: "lastSession", value: { sessionId, name } })
}

export async function lastKnownSession(
  storeId: string
): Promise<{ sessionId: string; name: string } | null> {
  const db = await openIdb(storeId)
  const row = await idbGet<{ key: string; value: { sessionId: string; name: string } }>(
    db,
    "meta",
    "lastSession"
  )
  return row?.value ?? null
}

export async function enqueueScan(
  storeId: string,
  event: QueuedEvent
): Promise<void> {
  const db = await openIdb(storeId)
  await idbPut(db, "queue", event)
  const key = `${event.sessionId}|${event.barcode}`
  const existing = await idbGet<MineRow>(db, "mine", key)
  const qty = (existing?.qty ?? 0) + event.qty
  if (qty <= 0) {
    await idbDelete(db, "mine", [key])
  } else {
    await idbPut(db, "mine", {
      key,
      sessionId: event.sessionId,
      barcode: event.barcode,
      qty,
      lastAt: Date.now(),
    } satisfies MineRow)
  }
}

export async function getMine(
  storeId: string,
  sessionId: string
): Promise<{ barcode: string; qty: number; lastAt: number }[]> {
  const db = await openIdb(storeId)
  const rows = await idbGetAll<MineRow>(db, "mine")
  return rows
    .filter((r) => r.sessionId === sessionId)
    .sort((a, b) => b.lastAt - a.lastAt)
    .map((r) => ({ barcode: r.barcode, qty: r.qty, lastAt: r.lastAt }))
}

export async function seedMine(
  storeId: string,
  sessionId: string,
  items: { barcode: string; qty: number }[]
): Promise<void> {
  const db = await openIdb(storeId)
  const now = Date.now()
  await idbBulkPut(
    db,
    "mine",
    items.map((i, idx) => ({
      key: `${sessionId}|${i.barcode}`,
      sessionId,
      barcode: i.barcode,
      qty: i.qty,
      lastAt: now - idx,
    }))
  )
}

export async function pendingCount(storeId: string): Promise<number> {
  const db = await openIdb(storeId)
  const rows = await idbGetAll<QueuedEvent>(db, "queue")
  return rows.length
}

export function startSync(
  auth: StoreAuth,
  cb: (state: SyncState) => void
): () => void {
  let stopped = false
  let draining = false
  let lastOkAt: number | null = null
  let authExpired = false

  const emit = async () => {
    const pending = await pendingCount(auth.storeId).catch(() => 0)
    cb({
      pending,
      lastOkAt,
      online: typeof navigator === "undefined" ? true : navigator.onLine,
      authExpired,
    })
  }

  const drain = async () => {
    if (stopped || draining || authExpired) return
    draining = true
    try {
      const db = await openIdb(auth.storeId)
      const all = await idbGetAll<QueuedEvent>(db, "queue")
      const bySession = new Map<string, QueuedEvent[]>()
      for (const e of all) {
        const list = bySession.get(e.sessionId) ?? []
        list.push(e)
        bySession.set(e.sessionId, list)
      }
      for (const [, events] of bySession) {
        for (let i = 0; i < events.length; i += 500) {
          const batch = events.slice(i, i + 500)
          await apiPostScan(auth.token, batch)
          await idbDelete(db, "queue", batch.map((e) => e.id))
          lastOkAt = Date.now()
        }
      }
      if (all.length === 0) lastOkAt = lastOkAt ?? Date.now()
    } catch (e) {
      if (e instanceof AuthExpiredError) authExpired = true
      // Diğer hatalar: çevrimdışı varsay, sonraki turda tekrar dene
    } finally {
      draining = false
      await emit()
    }
  }

  const interval = setInterval(drain, 4000)
  const onOnline = () => void drain()
  const onVisible = () => {
    if (document.visibilityState === "visible") void drain()
  }
  window.addEventListener("online", onOnline)
  window.addEventListener("offline", onOnline)
  document.addEventListener("visibilitychange", onVisible)
  void drain()

  return () => {
    stopped = true
    clearInterval(interval)
    window.removeEventListener("online", onOnline)
    window.removeEventListener("offline", onOnline)
    document.removeEventListener("visibilitychange", onVisible)
  }
}
