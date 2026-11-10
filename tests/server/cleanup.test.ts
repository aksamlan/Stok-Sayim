import { expect, test } from "vitest"
import { runCleanup, setRetentionDays } from "../../lib/server/cleanup"
import { openDatabase } from "../../lib/server/db"
import { createSession, createStore } from "../../lib/server/stores"

const DAY = 24 * 3600 * 1000

function makeStore(db: ReturnType<typeof openDatabase>, name: string, ageDays: number, email?: string) {
  const { storeId } = createStore(db, name, "say123", "admin123")
  db.prepare("UPDATE stores SET created_at = ?, email = ? WHERE id = ?").run(
    Date.now() - ageDays * DAY,
    email ?? null,
    storeId
  )
  return storeId
}

test("idle store beyond retention is deleted with all data", async () => {
  const db = openDatabase(":memory:")
  const oldId = makeStore(db, "Eski", 40, "eski@ornek.com")
  const freshId = makeStore(db, "Taze", 40)
  // taze mağazada yeni aktivite var (oturum açılmış)
  createSession(db, freshId, "Sayım")
  const mails: { to: string; subject: string }[] = []
  await runCleanup(db, Date.now(), async (to, subject) => {
    mails.push({ to: to ?? "", subject })
    return true
  })
  const names = (
    db.prepare("SELECT name FROM stores").all() as { name: string }[]
  ).map((r) => r.name)
  expect(names).toEqual(["Taze"])
  expect(
    (db.prepare("SELECT COUNT(*) AS n FROM counters WHERE store_id = ?").get(oldId) as { n: number }).n
  ).toBe(0)
  // silinen mağazaya veda maili gitti
  expect(mails.some((m) => m.to === "eski@ornek.com")).toBe(true)
})

test("store inside warning window gets one warning mail, not deleted", async () => {
  const db = openDatabase(":memory:")
  makeStore(db, "Uyarılık", 25, "sahip@ornek.com") // 30 günün son 7 günü içinde
  const mails: string[] = []
  await runCleanup(db, Date.now(), async (to) => {
    mails.push(to ?? "")
    return true
  })
  expect(mails).toEqual(["sahip@ornek.com"])
  // ikinci koşuda tekrar uyarı gitmez
  await runCleanup(db, Date.now(), async (to) => {
    mails.push(to ?? "")
    return true
  })
  expect(mails).toHaveLength(1)
  expect(
    (db.prepare("SELECT COUNT(*) AS n FROM stores").get() as { n: number }).n
  ).toBe(1)
})

test("retention 0 disables cleanup", async () => {
  const db = openDatabase(":memory:")
  makeStore(db, "Kalıcı", 400)
  setRetentionDays(db, 0)
  await runCleanup(db, Date.now(), async () => true)
  expect(
    (db.prepare("SELECT COUNT(*) AS n FROM stores").get() as { n: number }).n
  ).toBe(1)
})
