import { expect, test } from "vitest"
import {
  buildCatalog,
  detectColumns,
} from "../../lib/store-client/parse-catalog"

test("detects turkish headers", () => {
  const cols = detectColumns(["Barkod", "Ürün Adı", "Kategori", "Stok"])
  expect(cols).toEqual({ barcode: 0, name: 1, category: 2, expected: 3 })
})

test("detects english headers, category/expected optional", () => {
  const cols = detectColumns(["barcode", "name"])
  expect(cols).toEqual({ barcode: 0, name: 1, category: -1, expected: -1 })
})

test("numeric safe-integer barcode becomes exact string", () => {
  const { items, errors } = buildCatalog(
    [[8690123456789, "Süt", "Kahvaltılık", 12]],
    { barcode: 0, name: 1, category: 2, expected: 3 }
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
    { barcode: 0, name: 1, category: -1, expected: 3 }
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
    { barcode: 0, name: 1, category: 2, expected: 3 }
  )
  expect(errors).toEqual([])
  expect(items).toEqual([
    { barcode: "123", name: "Ürün", category: null, expected: null },
  ])
})
