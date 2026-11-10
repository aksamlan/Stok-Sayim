// Hareketsiz mağazaların otomatik temizliği: retention_days (varsayılan 30,
// 0 = kapalı) boyunca hiç aktivite (okutma/oturum/kuruluş) görmeyen mağaza,
// tüm verileriyle silinir. Silinmeden 7 gün önce e-posta ile uyarılır (SMTP
// ayarlıysa). Kontrol, API istekleri üzerinden en fazla 6 saatte bir çalışır.

import type { DatabaseSync } from "node:sqlite"
import { ApiError } from "./auth"
import { getMeta, setMeta } from "./db"
import { sendMail } from "./mail"
import { deleteStore } from "./superadmin"

const DAY = 24 * 3600 * 1000
const THROTTLE_MS = 6 * 3600 * 1000
const WARN_BEFORE_DAYS = 7
export const DEFAULT_RETENTION_DAYS = 30

export function getRetentionDays(db: DatabaseSync): number {
  const raw = getMeta(db, "retention_days")
  if (raw === null) return DEFAULT_RETENTION_DAYS
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_RETENTION_DAYS
}

export function setRetentionDays(db: DatabaseSync, days: number): void {
  if (!Number.isInteger(days) || days < 0 || days > 3650) {
    throw new ApiError(400, "Silme süresi 0-3650 gün arası olmalı (0 = kapalı)")
  }
  setMeta(db, "retention_days", String(days))
}

type Mailer = (to: string | null, subject: string, text: string) => Promise<boolean>

type StoreActivityRow = {
  id: string
  name: string
  code: string
  email: string | null
  cleanup_warned_at: number | null
  lastActivity: number
}

export async function runCleanup(
  db: DatabaseSync,
  now: number,
  mail: Mailer = sendMail
): Promise<{ deleted: number; warned: number }> {
  const days = getRetentionDays(db)
  if (days === 0) return { deleted: 0, warned: 0 }
  const rows = db
    .prepare(
      `SELECT s.id, s.name, s.code, s.email, s.cleanup_warned_at,
         MAX(
           s.created_at,
           COALESCE((SELECT MAX(received_at) FROM scan_events e WHERE e.store_id = s.id), 0),
           COALESCE((SELECT MAX(created_at) FROM sessions x WHERE x.store_id = s.id), 0)
         ) AS lastActivity
       FROM stores s`
    )
    .all() as StoreActivityRow[]

  let deleted = 0
  let warned = 0
  for (const row of rows) {
    const idleMs = now - row.lastActivity
    if (idleMs > days * DAY) {
      await mail(
        row.email,
        `Stokzen: "${row.name}" mağazası silindi`,
        `"${row.name}" (kod ${row.code}) mağazası ${days} gündür kullanılmadığı için ` +
          `tüm verileriyle birlikte otomatik olarak silindi.\n\n` +
          `Tekrar kullanmak istersen yeni bir mağaza kurman yeterli.`
      )
      deleteStore(db, row.id)
      deleted++
    } else if (idleMs > (days - WARN_BEFORE_DAYS) * DAY) {
      // Bu hareketsizlik döneminde daha önce uyarıldıysa tekrar gönderme
      const alreadyWarned =
        row.cleanup_warned_at !== null && row.cleanup_warned_at >= row.lastActivity
      if (!alreadyWarned) {
        await mail(
          row.email,
          `Stokzen: "${row.name}" mağazası yakında silinecek`,
          `"${row.name}" (kod ${row.code}) mağazası bir süredir kullanılmıyor.\n` +
            `${WARN_BEFORE_DAYS} gün içinde giriş yapılmazsa tüm verileriyle ` +
            `birlikte otomatik silinecek.\n\nSilinmesini istemiyorsan mağazana ` +
            `giriş yapman yeterli.`
        )
        db.prepare("UPDATE stores SET cleanup_warned_at = ? WHERE id = ?").run(now, row.id)
        warned++
      }
    }
  }
  return { deleted, warned }
}

// İstek yolundan çağrılır: ucuz kontrol, 6 saatte bir gerçek çalışma.
export function maybeCleanup(db: DatabaseSync): void {
  const last = Number(getMeta(db, "last_cleanup_at") ?? 0)
  const now = Date.now()
  if (now - last < THROTTLE_MS) return
  setMeta(db, "last_cleanup_at", String(now))
  void runCleanup(db, now).catch((e) =>
    console.error("[cleanup]", e instanceof Error ? e.message : e)
  )
}
