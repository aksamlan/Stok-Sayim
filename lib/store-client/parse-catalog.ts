import type { CatalogItem } from "./types"

export type ColumnMap = {
  barcode: number
  name: number
  category: number | -1
  expected: number | -1
}

const BARCODE_HEADERS = ["barkod", "barcode", "kod", "ean", "gtin"]
const NAME_HEADERS = ["ad", "ürün", "urun", "name", "açıklama", "aciklama", "isim"]
const CATEGORY_HEADERS = ["kategori", "category", "grup", "reyon", "bölüm", "bolum"]
const EXPECTED_HEADERS = ["stok", "adet", "miktar", "expected", "beklenen", "qty"]

function matchHeader(header: string, candidates: string[]): boolean {
  const h = header.toLocaleLowerCase("tr").trim()
  return candidates.some((c) => h.includes(c))
}

export function detectColumns(headers: string[]): ColumnMap {
  const find = (candidates: string[], exclude: number[] = []) => {
    for (let i = 0; i < headers.length; i++) {
      if (exclude.includes(i)) continue
      if (matchHeader(String(headers[i] ?? ""), candidates)) return i
    }
    return -1
  }
  const barcode = find(BARCODE_HEADERS)
  const name = find(NAME_HEADERS, [barcode])
  const category = find(CATEGORY_HEADERS, [barcode, name])
  const expected = find(EXPECTED_HEADERS, [barcode, name, category])
  return {
    barcode: barcode === -1 ? 0 : barcode,
    name: name === -1 ? (barcode === 1 ? 0 : 1) : name,
    category,
    expected,
  }
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
    })
  })
  return { items: [...byBarcode.values()], errors }
}

export async function sheetToRows(
  file: File
): Promise<{ headers: string[]; rows: unknown[][] }> {
  const XLSX = await import("xlsx")
  const data = await file.arrayBuffer()
  const wb = XLSX.read(data, { type: "array", raw: true })
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
