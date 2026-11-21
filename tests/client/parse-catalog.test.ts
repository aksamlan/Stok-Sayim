import { expect, test } from "vitest"
import {
  buildCatalog,
  buildPriceList,
  detectColumns,
  decodeCsv,
  parsePrice,
} from "../../lib/store-client/parse-catalog"

test("detects turkish headers", () => {
  const cols = detectColumns(["Barkod", "Ürün Adı", "Kategori", "Stok"])
  expect(cols).toEqual({ barcode: 0, name: 1, category: 2, expected: 3, salePrice: -1, costPrice: -1 })
})

test("detects english headers, category/expected optional", () => {
  const cols = detectColumns(["barcode", "name"])
  expect(cols).toEqual({ barcode: 0, name: 1, category: -1, expected: -1, salePrice: -1, costPrice: -1 })
})

test("numeric safe-integer barcode becomes exact string", () => {
  const { items, errors } = buildCatalog(
    [[8690123456789, "Süt", "Kahvaltılık", 12]],
    { barcode: 0, name: 1, category: 2, expected: 3, salePrice: -1, costPrice: -1 }
  )
  expect(errors).toEqual([])
  expect(items).toEqual([
    { barcode: "8690123456789", name: "Süt", category: "Kahvaltılık", expected: 12 },
  ])
})

test("scientific-notation barcode is rejected with row error", () => {
  const { items, errors } = buildCatalog([[8.69012345e18, "X", null, null]], {
    barcode: 0,
    name: 1,
    category: -1,
    expected: -1,
  })
  expect(items).toEqual([])
  expect(errors).toHaveLength(1)
  expect(errors[0]).toContain("satır 2")
})

test("duplicate barcodes: last wins", () => {
  const { items } = buildCatalog(
    [
      ["869", "Eski Ad", null, 1],
      ["869", "Yeni Ad", null, 2],
    ],
    { barcode: 0, name: 1, category: -1, expected: 3, salePrice: -1, costPrice: -1 }
  )
  expect(items).toEqual([
    { barcode: "869", name: "Yeni Ad", category: null, expected: 2 },
  ])
})

test("empty rows skipped, expected optional and non-numeric expected null", () => {
  const { items, errors } = buildCatalog(
    [
      ["", "", null, null],
      ["123", "Ürün", "  ", "yok"],
    ],
    { barcode: 0, name: 1, category: 2, expected: 3, salePrice: -1, costPrice: -1 }
  )
  expect(errors).toEqual([])
  expect(items).toEqual([
    { barcode: "123", name: "Ürün", category: null, expected: null },
  ])
})

test("barkod: 'Genel Barkod' seçilir, 'Grup Kodu/Malzeme Kodu' barkod sanılmaz", () => {
  const h = ["Stok Miktarı", "Grup Kodu", "Malzeme Adı", "Malzeme Kodu", "Genel Barkod", "GENEL BARKOD-3"]
  expect(detectColumns(h).barcode).toBe(4)
  // hiç barkod başlığı yoksa genel "kod"a düşer
  expect(detectColumns(["Kod", "Ürün"]).barcode).toBe(0)
})

test("fiyat sütunları: satış boşsa dolu 'fiyat 2' seçilir; alış ve 'Son Giriş' karışmaz", () => {
  const h = ["Stok Miktarı", "Genel Alış Fiyatı", "Genel Satış Fiyatı", "fiyat 2", "Son Giriş Fiyatı", "Malzeme Adı", "Genel Barkod"]
  const rows = Array.from({ length: 50 }, (_, i) => [3, 10 + i, 0, 15 + i, 0, "Ürün " + i, "869000" + i])
  const c = detectColumns(h, rows)
  expect(c.costPrice).toBe(1)
  expect(c.salePrice).toBe(3) // 2 numaralı 'Genel Satış Fiyatı' boş (0) → 'fiyat 2'
  // satış sütunu doluysa onu kullanır
  const rows2 = rows.map((r) => [r[0], r[1], 20, r[3], r[4], r[5], r[6]])
  expect(detectColumns(h, rows2).salePrice).toBe(2)
  // satırlar verilmezse yalnız başlığa bakar
  expect(detectColumns(h).salePrice).toBe(2)
})

test("parsePrice: Türkçe/İngilizce biçimler, 0/boş/saçma = null", () => {
  expect(parsePrice(12.5)).toBe(12.5)
  expect(parsePrice("1.234,50")).toBe(1234.5)
  expect(parsePrice("12,5")).toBe(12.5)
  expect(parsePrice("12.5")).toBe(12.5)
  expect(parsePrice("₺ 1,299.90")).toBe(1299.9)
  expect(parsePrice("185 TL")).toBe(185)
  for (const bad of [0, "0", "", null, undefined, "abc", -3, NaN, 1e12]) expect(parsePrice(bad)).toBeNull()
})

test("buildCatalog/buildPriceList: fiyatlar okunur; fiyat sütunu yoksa alan hiç eklenmez", () => {
  const cols = { barcode: 0, name: 1, category: -1, expected: -1, salePrice: 2, costPrice: 3 }
  const { items } = buildCatalog([["869", "Süt", 22.5, "17,25"]], cols)
  expect(items[0]).toMatchObject({ barcode: "869", salePrice: 22.5, costPrice: 17.25 })
  const noPrice = buildCatalog([["869", "Süt"]], { ...cols, salePrice: -1, costPrice: -1 }).items[0]
  expect("salePrice" in noPrice).toBe(false) // undefined → mevcut fiyat korunur
  const { items: pl } = buildPriceList([["869", "x", 0, 5], ["870", "y", 9, ""]], cols)
  expect(pl).toEqual([
    { barcode: "869", salePrice: null, costPrice: 5 },
    { barcode: "870", salePrice: 9, costPrice: null },
  ])
})

test("decodeCsv: UTF-8 (BOM'lu/BOM'suz) ve Windows-1254 Türkçe karakterleri bozmaz", () => {
  const text = "Genel Alış Fiyatı;Malzeme Adı\nŞeker;ığüöç"
  const utf8 = new TextEncoder().encode(text)
  expect(decodeCsv(utf8.buffer as ArrayBuffer)).toBe(text)
  const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8])
  expect(decodeCsv(withBom.buffer as ArrayBuffer)).toBe(text)
  // Windows-1254: ş=0xFE ı=0xFD ğ=0xF0 ü=0xFC ö=0xF6 ç=0xE7, Ş=0xDE
  const cp1254 = new Uint8Array([0xde, 0x65, 0x6b, 0x65, 0x72, 0x3b, 0xfd, 0xf0, 0xfc, 0xf6, 0xe7])
  expect(decodeCsv(cp1254.buffer as ArrayBuffer)).toBe("Şeker;ığüöç")
})
