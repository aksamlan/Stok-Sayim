#!/usr/bin/env node
// Çalışan SQLite veritabanından TUTARLI yedek kopya üretir (VACUUM INTO).
// Kullanım: node scripts/yedek.mjs <kaynak.db> <hedef.db>
import { existsSync, rmSync } from "node:fs"
import { DatabaseSync } from "node:sqlite"

const [source, target] = process.argv.slice(2)
if (!source || !target) {
  console.error("Kullanım: node scripts/yedek.mjs <kaynak.db> <hedef.db>")
  process.exit(1)
}
if (!existsSync(source)) {
  console.error(`Kaynak bulunamadı: ${source}`)
  process.exit(1)
}
if (existsSync(target)) rmSync(target)

const db = new DatabaseSync(source)
db.prepare("VACUUM INTO ?").run(target)
db.close()
console.log(`✔ Tutarlı yedek hazır: ${target}`)
