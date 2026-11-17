import { expect, test } from "vitest"
import { storeReportToCSV, type StoreReportRow } from "../../lib/export"

const row = (over: Partial<StoreReportRow>): StoreReportRow => ({
  barcode: "869",
  name: "Ürün",
  category: null,
  expected: 5,
  counted: 3,
  status: "difference",
  ...over,
})

test("formula-like cells are neutralized (CSV injection)", () => {
  const csv = storeReportToCSV([
    row({ barcode: '=HYPERLINK("http://evil";"aç")', name: "+SUM(A1)" }),
  ])
  const line = csv.split("\r\n")[1]
  expect(line.startsWith("\"'=HYPERLINK")).toBe(true)
  expect(line).toContain("'+SUM(A1)")
})

test("negative numbers stay plain", () => {
  const csv = storeReportToCSV([row({ expected: 10, counted: 3 })])
  const line = csv.split("\r\n")[1]
  // fark sütunu -7: tırnaksız, başına ' konmaz
  expect(line).toContain(";-7;")
})

test("kilolu ürün: CSV'de ondalık virgül, fark yuvarlanır", async () => {
  const { countToCSV, compareToCSV } = await import("../../lib/export")
  expect(countToCSV([{ barcode: "1", quantity: 2.5 }, { barcode: "2", quantity: 3 }])).toBe(
    "Barkod;Adet\r\n1;2,5\r\n2;3"
  )
  const csv = compareToCSV([{ barcode: "9", stockQty: 0.1, countQty: 0.3, status: "difference" }])
  expect(csv).toContain("9;0,1;0,3;+0,2;") // 0.3-0.1 = 0.19999… değil +0,2
})
