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

test("yonetici-sifre scripti meta'yı önceden yarattıysa uygulama yine açılır", async () => {
  // Gerçek hata: meta tablosu tek başına "eski veritabanı" sayılıp güncel
  // şemaya migrasyonlar uygulanıyor ("duplicate column name") ve her istek 500 veriyordu.
  const { DatabaseSync } = await import("node:sqlite")
  const dir = mkdtempSync(path.join(tmpdir(), "stokdb-"))
  const p = path.join(dir, "stok.db")
  const pre = new DatabaseSync(p)
  pre.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
  pre.exec("INSERT INTO meta (key, value) VALUES ('sa_pw_hash', 'x')")
  pre.close()
  const db = openDatabase(p)
  expect(getMeta(db, "sa_pw_hash")).toBe("x")
  expect(getMeta(db, "schema_version")).not.toBeNull()
  db.close()
  // Zaten migre edilmiş ama damgasız (bozuk kalmış) veritabanı da kurtarılır
  const raw = new DatabaseSync(p)
  raw.exec("DELETE FROM meta WHERE key='schema_version'")
  raw.close()
  const again = openDatabase(p)
  expect(getMeta(again, "schema_version")).not.toBeNull()
  again.close()
})
