import { expect, test } from "vitest"
import { csvQty, fmtQty, parseQtyInput, round2 } from "../../lib/qty"

test("adet yardımcıları: yuvarlama, Türkçe biçim, CSV virgülü, giriş çözümleme", () => {
  expect(round2(0.1 + 0.2)).toBe(0.3)
  expect(fmtQty(2.5)).toBe("2,5")
  expect(fmtQty(3)).toBe("3")
  expect(fmtQty(1250.5)).toBe("1.250,5")
  expect(csvQty(2.5)).toBe("2,5")
  expect(csvQty(4)).toBe("4")
  expect(parseQtyInput("2,5")).toBe(2.5)
  expect(parseQtyInput("0,")).toBe(0)
  expect(Number.isNaN(parseQtyInput("abc"))).toBe(true)
})
