import { expect, test } from "vitest"
import { runCleanup, setRetentionDays } from "../../lib/server/cleanup"
import { openDatabase } from "../../lib/server/db"
import { createSession, createStore, joinStore } from "../../lib/server/stores"

const DAY = 24 * 3600 * 1000

function makeStore(
  db: ReturnType<typeof openDatabase>,
  name: string,
  ageDays: number,
  email?: string
) {
  const { storeId, code } = createStore(db, name, "say123", "admin123")
  db.prepare(
    "UPDATE stores SET created_at = ?, last_seen_at = NULL, email = ? WHERE id = ?"
  ).run(Date.now() - ageDays * DAY, email ?? null, storeId)
  return { storeId, code }
}

test("idle store is WARNED first, deleted only 7+ days after the warning", async () => {
  const db = openDatabase(":memory:")
  const { storeId: oldId } = makeStore(db, "Eski", 40, "eski@ornek.com")
  const mails: { to: string; subject: string }[] = []
  const mailer = async (to: string | null, subject: string) => {
    mails.push({ to: to ?? "", subject })
    return true
  }
  // İlk tarama: silmez, uyarır (yükseltme sonrası ilk tarama bile güvenli)
  const r1 = await runCleanup(db, Date.now(), mailer)
  expect(r1.deleted).toBe(0)
  expect(r1.warned).toBe(1)
  expect(
    (db.prepare("SELECT COUNT(*) AS n FROM stores").get() as { n: number }).n
  ).toBe(1)
  // Uyarının üzerinden 7 gün geçmeden: hâlâ silmez
  const r2 = await runCleanup(db, Date.now() + 2 * DAY, mailer)
  expect(r2.deleted).toBe(0)
  // 7 gün sonra: siler, veda maili gider, tüm veriler gider
  const r3 = await runCleanup(db, Date.now() + 8 * DAY, mailer)
  expect(r3.deleted).toBe(1)
  expect(
    (db.prepare("SELECT COUNT(*) AS n FROM stores").get() as { n: number }).n
  ).toBe(0)
  expect(
    (
      db.prepare("SELECT COUNT(*) AS n FROM counters WHERE store_id = ?").get(oldId) as {
        n: number
      }
    ).n
  ).toBe(0)
  expect(mails.filter((m) => m.subject.includes("silindi"))).toHaveLength(1)
})

test("recent session or login counts as activity", async () => {
  const db = openDatabase(":memory:")
  const a = makeStore(db, "Oturumlu", 40)
  createSession(db, a.storeId, "Sayım")
  const b = makeStore(db, "Girişli", 40, "sahip@ornek.com")
  joinStore(db, b.code, "say123", "Ali", "1111") // giriş = aktivite (last_seen_at)
  const mails: string[] = []
  const r = await runCleanup(db, Date.now(), async (to) => {
    mails.push(to ?? "")
    return true
  })
  expect(r.warned).toBe(0)
  expect(r.deleted).toBe(0)
  expect(mails).toHaveLength(0)
})

test("warning sent once per idle period", async () => {
  const db = openDatabase(":memory:")
  makeStore(db, "Uyarılık", 25, "sahip@ornek.com")
  const mails: string[] = []
  const mailer = async (to: string | null) => {
    mails.push(to ?? "")
    return true
  }
  await runCleanup(db, Date.now(), mailer)
  expect(mails).toEqual(["sahip@ornek.com"])
  await runCleanup(db, Date.now(), mailer)
  expect(mails).toHaveLength(1)
})

test("retention 0 disables cleanup", async () => {
  const db = openDatabase(":memory:")
  makeStore(db, "Kalıcı", 400)
  setRetentionDays(db, 0)
  const r = await runCleanup(db, Date.now(), async () => true)
  expect(r.deleted + r.warned).toBe(0)
  expect(
    (db.prepare("SELECT COUNT(*) AS n FROM stores").get() as { n: number }).n
  ).toBe(1)
})
