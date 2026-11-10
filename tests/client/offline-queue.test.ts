import { expect, test } from "vitest"
import { ApiHttpError, AuthExpiredError } from "../../lib/store-client/api"
import { processQueue } from "../../lib/store-client/offline"
import type { QueuedEvent } from "../../lib/store-client/types"

const ev = (id: string, sessionId: string): QueuedEvent => ({
  id,
  sessionId,
  barcode: "869",
  qty: 1,
  createdAt: 1,
})

test("closed-session group (409) is stashed then dropped, other groups still post", async () => {
  const events = [ev("a1", "kapali"), ev("a2", "kapali"), ev("b1", "aktif")]
  const posted: string[][] = []
  const removed: string[][] = []
  const stashed: string[][] = []
  const result = await processQueue(
    events,
    async (batch) => {
      if (batch[0].sessionId === "kapali") {
        throw new ApiHttpError(409, "Bu sayım kapatılmış")
      }
      posted.push(batch.map((e) => e.id))
    },
    async (ids) => {
      removed.push(ids)
    },
    async (evts) => {
      stashed.push(evts.map((e) => e.id))
    }
  )
  expect(posted).toEqual([["b1"]])
  // düşen grup önce emanete (stash) yazıldı, sonra kuyruktan temizlendi
  expect(stashed.flat().sort()).toEqual(["a1", "a2"])
  expect(removed.flat().sort()).toEqual(["a1", "a2", "b1"])
  expect(result.dropped).toBe(2)
  expect(result.posted).toBe(1)
  expect(result.authExpired).toBe(false)
})

test("mid-group 409 stashes only the unposted remainder (no double count)", async () => {
  const events = [ev("a1", "s1"), ev("a2", "s1"), ev("a3", "s1")]
  let calls = 0
  const stashed: string[][] = []
  const removed: string[][] = []
  const result = await processQueue(
    events,
    async () => {
      calls++
      // ilk parti (a1) başarıyla gider; sayım tam o anda kapatılır
      if (calls > 1) throw new ApiHttpError(409, "Bu sayım kapatılmış")
    },
    async (ids) => {
      removed.push(ids)
    },
    async (evts) => {
      stashed.push(evts.map((e) => e.id))
    },
    1 // test için parti boyutu 1
  )
  expect(result.posted).toBe(1)
  expect(result.dropped).toBe(2)
  // a1 sunucuda — emanete GİRMEMELİ; yalnız a2+a3 kurtarma CSV'sine düşer
  expect(stashed.flat().sort()).toEqual(["a2", "a3"])
  expect(removed.flat().sort()).toEqual(["a1", "a2", "a3"])
})

test("network error keeps events queued and is not a drop", async () => {
  const removed: string[][] = []
  const result = await processQueue(
    [ev("a1", "s1")],
    async () => {
      throw new Error("Sunucuya ulaşılamadı")
    },
    async (ids) => {
      removed.push(ids)
    }
  )
  expect(removed).toEqual([])
  expect(result.dropped).toBe(0)
  expect(result.posted).toBe(0)
})

test("auth expiry stops draining and keeps the queue", async () => {
  const removed: string[][] = []
  const result = await processQueue(
    [ev("a1", "s1"), ev("b1", "s2")],
    async () => {
      throw new AuthExpiredError()
    },
    async (ids) => {
      removed.push(ids)
    }
  )
  expect(removed).toEqual([])
  expect(result.authExpired).toBe(true)
})
