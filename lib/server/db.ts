import { mkdirSync } from "node:fs"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  count_pw_hash TEXT NOT NULL,
  admin_pw_hash TEXT NOT NULL,
  catalog_version INTEGER NOT NULL DEFAULT 0,
  token_version INTEGER NOT NULL DEFAULT 1,
  email TEXT,
  phone TEXT,
  email_verified_at INTEGER,
  cleanup_warned_at INTEGER,
  last_seen_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_store ON sessions(store_id, status);
CREATE TABLE IF NOT EXISTS products (
  store_id TEXT NOT NULL,
  barcode TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  expected_qty REAL,
  PRIMARY KEY (store_id, barcode)
);
CREATE TABLE IF NOT EXISTS scan_events (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  counter TEXT NOT NULL,
  barcode TEXT NOT NULL,
  qty INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  received_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_barcode ON scan_events(store_id, session_id, barcode);
CREATE INDEX IF NOT EXISTS idx_events_counter ON scan_events(store_id, session_id, counter);
CREATE TABLE IF NOT EXISTS counters (
  store_id TEXT NOT NULL,
  name TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (store_id, name)
);
`

// KURAL: SCHEMA her zaman EN GÜNCEL şemayı tanımlar (yeni kurulum doğrudan
// günceli alır). Eski veritabanlarını güncele taşıyan dönüşümler ise buraya
// sürüm sırasıyla eklenir. Yeni (bomboş) bir veritabanı migrasyonları HİÇ
// çalıştırmadan hedef sürüme damgalanır; yalnız eski veritabanları eksik
// migrasyonları sırayla uygular.
const MIGRATIONS: string[] = [
  // v2: şifre/PIN sıfırlanınca eski oturumları geçersiz kılmak için
  "ALTER TABLE stores ADD COLUMN token_version INTEGER NOT NULL DEFAULT 1",
  // v3: iletişim e-postası + hareketsizlik temizliği uyarı damgası
  "ALTER TABLE stores ADD COLUMN email TEXT;\n" +
    "ALTER TABLE stores ADD COLUMN cleanup_warned_at INTEGER",
  // v4: kötüye kullanım önleme — telefon + e-posta doğrulama damgası
  // (DİKKAT: uygulanmış bir migrasyon ASLA değiştirilmez; yeni değişiklik
  // her zaman yeni bir sürüm olarak eklenir.)
  "ALTER TABLE stores ADD COLUMN phone TEXT;\n" +
    "ALTER TABLE stores ADD COLUMN email_verified_at INTEGER",
  // v5: son kullanım damgası — giriş/pano kullanımı da aktivite sayılır,
  // hareketsizlik temizliği aktif kullanılan mağazayı silemez
  "ALTER TABLE stores ADD COLUMN last_seen_at INTEGER",
]
const SCHEMA_TARGET = 1 + MIGRATIONS.length

function applyMigrations(db: DatabaseSync, fresh: boolean): void {
  if (fresh) {
    setMeta(db, "schema_version", String(SCHEMA_TARGET))
    return
  }
  const raw = getMeta(db, "schema_version")
  if (!raw) {
    // Sürüm damgası yok: ya yönetici-şifre scripti meta tablosunu uygulamadan
    // ÖNCE yarattı (şema zaten güncel), ya da gerçekten eski bir veritabanı.
    // Son migrasyonun kolonu varsa şema günceldir: yalnız damgala.
    const cols = db.prepare("PRAGMA table_info(stores)").all() as { name: string }[]
    if (cols.some((c) => c.name === "last_seen_at")) {
      setMeta(db, "schema_version", String(SCHEMA_TARGET))
      return
    }
  }
  let current = raw ? Number(raw) : 1
  if (!Number.isFinite(current) || current < 1) current = 1
  for (let v = current; v < SCHEMA_TARGET; v++) {
    db.exec("BEGIN")
    try {
      db.exec(MIGRATIONS[v - 1])
      setMeta(db, "schema_version", String(v + 1))
      db.exec("COMMIT")
    } catch (e) {
      db.exec("ROLLBACK")
      throw e
    }
  }
  if (!raw) setMeta(db, "schema_version", String(SCHEMA_TARGET))
}

export function openDatabase(dbPath: string): DatabaseSync {
  if (dbPath !== ":memory:") {
    mkdirSync(path.dirname(dbPath), { recursive: true })
  }
  const db = new DatabaseSync(dbPath)
  if (dbPath !== ":memory:") {
    db.exec("PRAGMA journal_mode=WAL")
  }
  db.exec("PRAGMA foreign_keys=ON")
  // Tazelik tespiti SCHEMA'dan ÖNCE yapılmalı: stores tablosu hiç yoksa bu
  // (meta tek başına yeterli değil: yonetici-sifre.mjs onu önceden yaratır) bu
  // yepyeni bir veritabanıdır ve SCHEMA zaten güncel halini kurar.
  const fresh = !db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='stores'")
    .get()
  db.exec(SCHEMA)
  // SQLite'ın NOCASE'i ASCII-dışını (İ/ı/Ş...) tanımaz; Türkçe arama için
  // JS'in tr-locale küçük harfe çevirmesini SQL'e fonksiyon olarak veriyoruz.
  db.function("tr_lower", { deterministic: true }, (value: unknown) =>
    value == null ? null : String(value).toLocaleLowerCase("tr")
  )
  applyMigrations(db, fresh)
  return db
}

const g = globalThis as typeof globalThis & { __stokDb?: DatabaseSync }

export function getDb(): DatabaseSync {
  if (!g.__stokDb) {
    const dir = process.env.DATA_DIR ?? "./data"
    g.__stokDb = openDatabase(path.join(dir, "stok.db"))
  }
  return g.__stokDb
}

export function getMeta(db: DatabaseSync, key: string): string | null {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as
    | { value: string }
    | undefined
  return row ? row.value : null
}

export function setMeta(db: DatabaseSync, key: string, value: string): void {
  db.prepare(
    "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, value)
}
