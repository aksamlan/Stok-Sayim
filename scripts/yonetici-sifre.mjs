#!/usr/bin/env node
// Stokzen platform yöneticisi (/yonetim) şifresini belirler ya da sıfırlar.
// Kullanım: node scripts/yonetici-sifre.mjs <yeni-şifre>
// DB dosyası: $DATA_DIR/stok.db (varsayılan ./data/stok.db)

import { randomBytes, scryptSync } from "node:crypto"
import { mkdirSync } from "node:fs"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"

const password = process.argv[2]
if (!password || password.length < 6) {
  console.error("Kullanım: node scripts/yonetici-sifre.mjs <yeni-şifre>")
  console.error("Şifre en az 6 karakter olmalı.")
  process.exit(1)
}

const dir = process.env.DATA_DIR ?? "./data"
mkdirSync(dir, { recursive: true })
const dbPath = path.join(dir, "stok.db")
const db = new DatabaseSync(dbPath)
db.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)")

const salt = randomBytes(16)
const key = scryptSync(password, salt, 32)
const hash = `${salt.toString("hex")}:${key.toString("hex")}`

db.prepare(
  "INSERT INTO meta (key, value) VALUES ('sa_pw_hash', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
).run(hash)
db.close()

console.log(`✔ Platform yöneticisi şifresi güncellendi (${dbPath})`)
console.log("  Panele giriş: /yonetim")
