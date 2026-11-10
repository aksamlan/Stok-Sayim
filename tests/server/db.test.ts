import { expect, test } from "vitest"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { getMeta, openDatabase, setMeta } from "../../lib/server/db"

test("schema tables exist", () => {
  const db = openDatabase(":memory:")
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all() as { name: string }[]
  const names = rows.map((r) => r.name)
  for (const t of ["stores", "sessions", "products", "scan_events", "meta"]) {
    expect(names).toContain(t)
  }
})

test("meta roundtrip", () => {
  const db = openDatabase(":memory:")
  expect(getMeta(db, "x")).toBeNull()
  setMeta(db, "x", "1")
  expect(getMeta(db, "x")).toBe("1")
  setMeta(db, "x", "2")
  expect(getMeta(db, "x")).toBe("2")
})

test("open idempotent on same file (creates missing dirs)", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "stokdb-"))
  const p = path.join(dir, "sub", "stok.db")
  const a = openDatabase(p)
  a.close()
  const b = openDatabase(p)
  b.close()
})
