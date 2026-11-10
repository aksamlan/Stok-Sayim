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
`

// Gelecek sürümlerde şema değişiklikleri buraya eklenir (her giriş bir sürüm):
// örn. "ALTER TABLE products ADD COLUMN price REAL" → v2.
// Servis her açılışta eksik migrasyonları sırayla ve transaction içinde uygular.
const MIGRATIONS: string[] = []

function applyMigrations(db: DatabaseSync): void {
  const raw = getMeta(db, "schema_version")
  let current = raw ? Number(raw) : 1
  if (!Number.isFinite(current) || current < 1) current = 1
  const target = 1 + MIGRATIONS.length
  for (let v = current; v < target; v++) {
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
  if (!raw) setMeta(db, "schema_version", String(target))
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
  db.exec(SCHEMA)
  applyMigrations(db)
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
