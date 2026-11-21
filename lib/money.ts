import { round2 } from "./qty"

// TL gösterimi: 12.345,50 ₺ (KKTC de TL kullanır)
export const fmtTL = (n: number): string =>
  `${round2(n).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`

// Büyük toplamlar için kısa: 1,25 Mn ₺ gibi değil, tam tutar daha doğru; yalnız tablo hücresi için kısa biçim
export const fmtTLShort = (n: number): string =>
  round2(n).toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })

// Sayım tutarı = sayılan adet × birim fiyat (fiyat yoksa null)
export const lineValue = (qty: number, price: number | null | undefined): number | null =>
  price != null && price > 0 ? round2(qty * price) : null
