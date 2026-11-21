import type { CatalogItem } from "./types"

export type ColumnMap = {
  barcode: number
  name: number
  category: number | -1
  expected: number | -1
  salePrice?: number | -1 // verilmezse fiyat okunmaz
  costPrice?: number | -1
}

// Önce "gerçek" barkod başlıkları; yalnız hiçbiri yoksa genel "kod" (Malzeme Kodu / Grup Kodu
// gibi sütunlar barkod sanılmasın).
const BARCODE_HEADERS_STRONG = ["barkod", "barcode", "ean", "gtin"]
const BARCODE_HEADERS_WEAK = ["kod"]
const SALE_HEADERS = ["satış", "satis", "sale", "perakende", "price"]
const COST_HEADERS = ["alış", "alis", "cost", "maliyet"]
const NAME_HEADERS = ["ad", "ürün", "urun", "name", "açıklama", "aciklama", "isim"]
const CATEGORY_HEADERS = ["kategori", "category", "grup", "reyon", "bölüm", "bolum"]
const EXPECTED_HEADERS = ["stok", "adet", "miktar", "expected", "beklenen", "qty"]

function matchHeader(header: string, candidates: string[]): boolean {
  const h = header.toLocaleLowerCase("tr").trim()
  return candidates.some((c) => h.includes(c))
}

// Boş sayılmayan (sayı > 0 ya da dolu metin) hücre oranı: fiyat sütunu gerçekten dolu mu?
export function fillRate(rows: unknown[][], col: number, sample = 2000): number {
  if (col < 0 || rows.length === 0) return 0
  const n = Math.min(rows.length, sample)
  let filled = 0
  for (let i = 0; i < n; i++) if (parsePrice(rows[i]?.[col]) !== null) filled++
  return filled / n
}

export function detectColumns(headers: string[], rows?: unknown[][]): ColumnMap {
  const find = (candidates: string[], exclude: number[] = []) => {
    for (let i = 0; i < headers.length; i++) {
      if (exclude.includes(i)) continue
      if (matchHeader(String(headers[i] ?? ""), candidates)) return i
    }
    return -1
  }
  let barcode = find(BARCODE_HEADERS_STRONG)
  if (barcode === -1) barcode = find(BARCODE_HEADERS_WEAK)
  const name = find(NAME_HEADERS, [barcode])
  const category = find(CATEGORY_HEADERS, [barcode, name])
  const expected = find(EXPECTED_HEADERS, [barcode, name, category])
  const used = [barcode, name, category, expected]
  // "Son giriş fiyatı" alış fiyatı sayılmasın
  const costIdx = headers.findIndex(
    (h, i) => !used.includes(i) && matchHeader(String(h ?? ""), COST_HEADERS) && !/son\s*giri/i.test(String(h))
  )
  // Satış: başlığında "satış" geçen sütun; ama o sütun BOŞSA (ör. "Genel Satış Fiyatı" hep 0)
  // ve dosyada "fiyat 2/3/4" gibi dolu bir fiyat sütunu varsa onu seç.
  const saleIdx = headers.findIndex((h, i) => !used.includes(i) && i !== costIdx && matchHeader(String(h ?? ""), SALE_HEADERS))
  let salePrice = saleIdx
  if (rows && rows.length > 0 && (saleIdx === -1 || fillRate(rows, saleIdx) < 0.2)) {
    const alt = headers.findIndex(
      (h, i) =>
        !used.includes(i) &&
        i !== costIdx &&
        i !== saleIdx &&
        /^fiyat\s*\d*$/i.test(String(h ?? "").trim()) &&
        fillRate(rows, i) >= 0.5
    )
    if (alt !== -1) salePrice = alt
  }
  return {
    barcode: barcode === -1 ? 0 : barcode,
    name: name === -1 ? (barcode === 1 ? 0 : 1) : name,
    category,
    expected,
    salePrice,
    costPrice: costIdx,
  }
}

// Fiyat hücresi → sayı (TL). "1.234,50", "12,5", "12.5", "₺ 12" hepsi okunur; 0/boş/geçersiz = null.
export function parsePrice(value: unknown): number | null {
  let n: number
  if (typeof value === "number") n = value
  else if (typeof value === "string") {
    let s = value.replace(/[^\d.,-]/g, "")
    if (!s) return null
    const lc = s.lastIndexOf(","), ld = s.lastIndexOf(".")
    if (lc >= 0 && ld >= 0) s = lc > ld ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "")
    else if (lc >= 0) s = s.replace(",", ".")
    n = Number(s)
  } else return null
  if (!Number.isFinite(n) || n <= 0 || n > 10_000_000) return null
  return Math.round(n * 100) / 100
}

function cellToBarcode(value: unknown): { barcode: string } | { error: string } | null {
  if (value == null) return null
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      return { error: "barkod bilimsel gösterimde ya da çok büyük (sütunu Excel'de metne çevir)" }
    }
    return { barcode: String(value) }
  }
  const s = String(value).trim()
  if (!s) return null
  if (/e\+/i.test(s)) {
    return { error: "barkod bilimsel gösterimde (sütunu Excel'de metne çevir)" }
  }
  return { barcode: s }
}

export function buildCatalog(
  rows: unknown[][],
  cols: ColumnMap
): { items: CatalogItem[]; errors: string[] } {
  const byBarcode = new Map<string, CatalogItem>()
  const errors: string[] = []
  rows.forEach((row, i) => {
    const parsed = cellToBarcode(row[cols.barcode])
    if (parsed === null) return
    // +2: 1 başlık satırı + 1 tabanlı satır numarası
    if ("error" in parsed) {
      errors.push(`satır ${i + 2}: ${parsed.error}`)
      return
    }
    const name = String(row[cols.name] ?? "").trim()
    const categoryRaw =
      cols.category >= 0 ? String(row[cols.category] ?? "").trim() : ""
    let expected: number | null = null
    if (cols.expected >= 0) {
      const v = row[cols.expected]
      const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."))
      expected = Number.isFinite(n) && String(v ?? "").trim() !== "" ? n : null
    }
    byBarcode.set(parsed.barcode, {
      barcode: parsed.barcode,
      name,
      category: categoryRaw || null,
      expected,
      ...((cols.salePrice ?? -1) >= 0 ? { salePrice: parsePrice(row[cols.salePrice as number]) } : {}),
      ...((cols.costPrice ?? -1) >= 0 ? { costPrice: parsePrice(row[cols.costPrice as number]) } : {}),
    })
  })
  return { items: [...byBarcode.values()], errors }
}

// CSV baytlarını metne çevirir: önce UTF-8 (BOM'lu/BOM'suz), geçerli UTF-8 değilse Windows-1254
// (Türkçe Excel'in "CSV" kaydı). Aksi halde ı/ş/ğ bozulur ve sütun başlıkları tanınmaz.
export function decodeCsv(buf: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf).replace(/^\uFEFF/, "")
  } catch {
    return new TextDecoder("windows-1254").decode(buf)
  }
}

export async function sheetToRows(
  file: File
): Promise<{ headers: string[]; rows: unknown[][] }> {
  const XLSX = await import("xlsx")
  const data = await file.arrayBuffer()
  const wb = /\.csv$/i.test(file.name)
    ? XLSX.read(decodeCsv(data), { type: "string", raw: true })
    : XLSX.read(data, { type: "array", raw: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const all = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    raw: true,
    defval: null,
  })
  if (all.length === 0) return { headers: [], rows: [] }
  const headers = (all[0] ?? []).map((h) => String(h ?? ""))
  return { headers, rows: all.slice(1) }
}

// Yalnız fiyat listesi (barkod + satış/alış): ürün listesi ve stoklara dokunmadan fiyatları günceller.
export function buildPriceList(
  rows: unknown[][],
  cols: ColumnMap
): { items: { barcode: string; salePrice?: number | null; costPrice?: number | null }[]; errors: string[] } {
  const byBarcode = new Map<string, { barcode: string; salePrice?: number | null; costPrice?: number | null }>()
  const errors: string[] = []
  rows.forEach((row, i) => {
    const parsed = cellToBarcode(row[cols.barcode])
    if (parsed === null) return
    if ("error" in parsed) {
      errors.push(`satır ${i + 2}: ${parsed.error}`)
      return
    }
    const item: { barcode: string; salePrice?: number | null; costPrice?: number | null } = {
      barcode: parsed.barcode,
    }
    if ((cols.salePrice ?? -1) >= 0) item.salePrice = parsePrice(row[cols.salePrice as number])
    if ((cols.costPrice ?? -1) >= 0) item.costPrice = parsePrice(row[cols.costPrice as number])
    byBarcode.set(parsed.barcode, item)
  })
  return { items: [...byBarcode.values()], errors }
}
