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

test("marka görseli: PNG kabul, SVG/bozuk reddedilir, sıfırlayınca varsayılana döner", async () => {
  const { setBrand, resetBrand, readBrand, brandStatus } = await import("../../lib/server/brand")
  const db = openDatabase(":memory:")
  const png = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex")
  setBrand(db, "icon", `data:image/png;base64,${png.toString("base64")}`)
  expect(brandStatus(db).iconCustom).toBe(true)
  expect(readBrand(db, "icon").mime).toBe("image/png")
  expect(() =>
    setBrand(db, "logo", `data:image/svg+xml;base64,${Buffer.from("<svg onload=alert(1)/>").toString("base64")}`)
  ).toThrow()
  expect(() => setBrand(db, "logo", "data:image/png;base64,AAAA")).toThrow()
  resetBrand(db, "icon")
  expect(brandStatus(db).iconCustom).toBe(false)
})

test("v5→v6 geçiş: eski şemadaki (fiyat kolonsuz) veritabanı açılır, ürünler korunur, kolonlar eklenir", async () => {
  const { DatabaseSync } = await import("node:sqlite")
  const dir = mkdtempSync(path.join(tmpdir(), "stokdb-"))
  const p = path.join(dir, "stok.db")
  // Canlıdakine benzer: v5 damgalı, products'ta fiyat kolonları YOK, mağaza + ürün + okutma var
  const old = new DatabaseSync(p)
  old.exec(`
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO meta VALUES ('schema_version', '5');
    CREATE TABLE stores (id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      count_pw_hash TEXT NOT NULL, admin_pw_hash TEXT NOT NULL, catalog_version INTEGER NOT NULL DEFAULT 0,
      token_version INTEGER NOT NULL DEFAULT 1, email TEXT, phone TEXT, email_verified_at INTEGER,
      cleanup_warned_at INTEGER, last_seen_at INTEGER, created_at INTEGER NOT NULL);
    CREATE TABLE products (store_id TEXT NOT NULL, barcode TEXT NOT NULL, name TEXT NOT NULL,
      category TEXT, expected_qty REAL, PRIMARY KEY (store_id, barcode));
    INSERT INTO stores (id, code, name, count_pw_hash, admin_pw_hash, created_at) VALUES ('s1','AAAAAA','Şube','x','y',1);
    INSERT INTO products VALUES ('s1','869','Süt','K',5);
  `)
  old.close()
  const db = openDatabase(p)
  const cols = (db.prepare("PRAGMA table_info(products)").all() as { name: string }[]).map((c) => c.name)
  expect(cols).toContain("sale_price")
  expect(cols).toContain("cost_price")
  expect(db.prepare("SELECT name, expected_qty, sale_price FROM products").get()).toMatchObject({ name: "Süt", expected_qty: 5, sale_price: null })
  expect(getMeta(db, "schema_version")).toBe("6")
  db.close()
  // ikinci açılış sorunsuz (idempotent)
  openDatabase(p).close()
})
