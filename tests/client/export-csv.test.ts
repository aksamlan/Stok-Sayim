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
