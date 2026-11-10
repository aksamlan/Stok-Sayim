// Marka görselleri (logo + simge/favicon). Varsayılanlar public/brand/ altında;
// /yonetim panelinden yüklenen özel görseller meta tablosunda saklanır
// (DB yedeğine dahil olur, ayrı dosya yönetimi gerekmez).
import { readFileSync } from "node:fs"
import path from "node:path"
import type { DatabaseSync } from "node:sqlite"
import { ApiError } from "./auth"
import { getMeta, setMeta } from "./db"

export const BRAND_KINDS = ["logo", "icon"] as const
export type BrandKind = (typeof BRAND_KINDS)[number]

export const MAX_BRAND_BYTES = 1_500_000

const DEFAULTS: Record<BrandKind, string> = {
  logo: "logo.png",
  icon: "icon.png",
}

export function isBrandKind(k: string): k is BrandKind {
  return (BRAND_KINDS as readonly string[]).includes(k)
}

// Yalnızca raster formatlar: SVG içine script gömülebildiği için kabul edilmez.
export function sniffImageMime(buf: Buffer): string | null {
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return "image/png"
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg"
  if (buf.length > 12 && buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP")
    return "image/webp"
  return null
}

export function setBrand(db: DatabaseSync, kind: BrandKind, dataUrl: string): void {
  const m = /^data:([\w/+.-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl ?? "")
  if (!m) throw new ApiError(400, "Geçersiz görsel verisi")
  const buf = Buffer.from(m[2], "base64")
  if (buf.length === 0 || buf.length > MAX_BRAND_BYTES)
    throw new ApiError(400, "Görsel en fazla 1,5 MB olabilir")
  const mime = sniffImageMime(buf)
  if (!mime) throw new ApiError(400, "Yalnızca PNG, JPG veya WEBP yükleyebilirsin")
  setMeta(db, `brand_${kind}`, `${mime};${buf.toString("base64")}`)
  setMeta(db, "brand_updated", String(Date.now()))
}

export function resetBrand(db: DatabaseSync, kind: BrandKind): void {
  db.prepare("DELETE FROM meta WHERE key = ?").run(`brand_${kind}`)
  setMeta(db, "brand_updated", String(Date.now()))
}

export function brandStatus(db: DatabaseSync) {
  return {
    logoCustom: getMeta(db, "brand_logo") !== null,
    iconCustom: getMeta(db, "brand_icon") !== null,
    updatedAt: Number(getMeta(db, "brand_updated") ?? 0),
  }
}

export function readBrand(
  db: DatabaseSync,
  kind: BrandKind
): { body: Buffer; mime: string; etag: string } {
  const custom = getMeta(db, `brand_${kind}`)
  if (custom) {
    const i = custom.indexOf(";")
    const body = Buffer.from(custom.slice(i + 1), "base64")
    return {
      body,
      mime: custom.slice(0, i),
      etag: `"c-${getMeta(db, "brand_updated") ?? "0"}-${body.length}"`,
    }
  }
  const body = readFileSync(path.join(process.cwd(), "public", "brand", DEFAULTS[kind]))
  return { body, mime: "image/png", etag: `"d-${body.length}"` }
}
