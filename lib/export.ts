// Dışa aktarma ve paylaşma yardımcıları: XLSX, CSV ve Web Share.

import { fmtDateTime, todayISO } from "./time"

export interface CountRow {
  barcode: string
  quantity: number
}

export interface CompareRow {
  barcode: string
  stockQty: number
  countQty: number
  status: "match" | "difference" | "only-stock" | "only-count"
}

const STATUS_TEXT: Record<CompareRow["status"], string> = {
  match: "Eşit",
  difference: "Farklı",
  "only-stock": "Sayılmadı",
  "only-count": "Fazla",
}

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

const todayStr = () => todayISO()

const dateTimeStr = () => fmtDateTime()

// Dosya adında sorun çıkarmayacak bir oturum adı üret
const safeName = (name: string) =>
  name
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 40) || "sayim"

// Noktalı virgül/çift tırnak içeren değerleri güvenli yaz. Ayrıca =,+,@ ile
// başlayan metinleri ' ile etkisizleştir: Excel bunları formül olarak çalıştırır
// (CSV formül enjeksiyonu). Gerçek sayılar (örn. -3 farkı) olduğu gibi kalır.
const csvCell = (v: string | number) => {
  let s = String(v)
  if (/^[=+@\t\r-]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) {
    s = "'" + s
  }
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

const diffText = (r: CompareRow) =>
  r.status === "match"
    ? "0"
    : r.status === "only-stock"
      ? `-${r.stockQty}`
      : r.status === "only-count"
        ? `+${r.countQty}`
        : `${r.countQty - r.stockQty > 0 ? "+" : ""}${r.countQty - r.stockQty}`

// ---------------------------------------------------------------- CSV

export const countToCSV = (items: CountRow[]) =>
  ["Barkod;Adet", ...items.map(i => `${csvCell(i.barcode)};${i.quantity}`)].join(
    "\r\n"
  )

export const compareToCSV = (rows: CompareRow[]) =>
  [
    "Barkod;Stok;Sayım;Fark;Durum",
    ...rows.map(r =>
      [
        csvCell(r.barcode),
        r.stockQty,
        r.countQty,
        diffText(r),
        STATUS_TEXT[r.status],
      ].join(";")
    ),
  ].join("\r\n")

export const downloadCountCSV = (items: CountRow[], sessionName: string) => {
  const blob = new Blob(["﻿" + countToCSV(items)], {
    type: "text/csv;charset=utf-8;",
  })
  downloadBlob(blob, `${safeName(sessionName)}_${todayStr()}.csv`)
}

export const downloadCompareCSV = (rows: CompareRow[], sessionName: string) => {
  const blob = new Blob(["﻿" + compareToCSV(rows)], {
    type: "text/csv;charset=utf-8;",
  })
  downloadBlob(blob, `karsilastirma_${safeName(sessionName)}_${todayStr()}.csv`)
}

// ---------------------------------------------------------------- XLSX

const makeCountXLSXBlob = async (items: CountRow[]): Promise<Blob> => {
  const XLSX = await import("xlsx")
  // Barkodlar metin olarak yazılır ki Excel 13 haneli sayıları bozmasın
  const ws = XLSX.utils.aoa_to_sheet([
    ["Barkod", "Adet"],
    ...items.map(i => [i.barcode, i.quantity]),
  ])
  ws["!cols"] = [{ wch: 22 }, { wch: 10 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Stok Sayım")
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array", compression: true })
  return new Blob([out], { type: XLSX_MIME })
}

const makeCompareXLSXBlob = async (rows: CompareRow[]): Promise<Blob> => {
  const XLSX = await import("xlsx")
  const ws = XLSX.utils.aoa_to_sheet([
    ["Barkod", "Stok", "Sayım", "Fark", "Durum"],
    ...rows.map(r => [
      r.barcode,
      r.stockQty,
      r.countQty,
      r.countQty - r.stockQty,
      STATUS_TEXT[r.status],
    ]),
  ])
  ws["!cols"] = [{ wch: 22 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 12 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Karşılaştırma")
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array", compression: true })
  return new Blob([out], { type: XLSX_MIME })
}

export const downloadCountXLSX = async (
  items: CountRow[],
  sessionName: string
) => {
  const blob = await makeCountXLSXBlob(items)
  downloadBlob(blob, `${safeName(sessionName)}_${todayStr()}.xlsx`)
}

export const downloadCompareXLSX = async (
  rows: CompareRow[],
  sessionName: string
) => {
  const blob = await makeCompareXLSXBlob(rows)
  downloadBlob(
    blob,
    `karsilastirma_${safeName(sessionName)}_${todayStr()}.xlsx`
  )
}

// ---------------------------------------------------------------- Paylaşma

export type ShareOutcome = "file" | "text" | "clipboard" | "cancelled" | "none"

const isAbort = (err: unknown) =>
  err instanceof DOMException && err.name === "AbortError"

const buildCountText = (items: CountRow[], sessionName: string) => {
  const totalQty = items.reduce((s, i) => s + i.quantity, 0)
  const lines = items.map(i => `${i.barcode}: ${i.quantity}`)
  return (
    `📦 Stok Sayım — ${sessionName} (${dateTimeStr()})\n` +
    `Toplam ürün: ${totalQty} · Farklı barkod: ${items.length}\n\n` +
    lines.join("\n")
  )
}

const buildCompareText = (rows: CompareRow[], sessionName: string) => {
  const lines = rows.map(
    r =>
      `${r.barcode}: stok ${r.stockQty}, sayım ${r.countQty} (${diffText(r)}) — ${STATUS_TEXT[r.status]}`
  )
  return (
    `📊 Stok Karşılaştırma — ${sessionName} (${dateTimeStr()})\n\n` +
    lines.join("\n")
  )
}

// Önce CSV dosyası olarak paylaşmayı dener (anında hazır, her yerde açılır),
// olmazsa düz metin paylaşır, o da yoksa panoya kopyalar.
const shareWith = async (
  csv: string,
  filename: string,
  title: string,
  text: string
): Promise<ShareOutcome> => {
  if (typeof navigator === "undefined") return "none"

  const blob = new Blob(["﻿" + csv], { type: "text/csv" })
  const file = new File([blob], filename, { type: "text/csv" })

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title, text: title })
      return "file"
    } catch (err) {
      if (isAbort(err)) return "cancelled"
      // dosya paylaşımı başarısız — metinle devam et
    }
  }

  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title, text })
      return "text"
    } catch (err) {
      if (isAbort(err)) return "cancelled"
    }
  }

  try {
    await navigator.clipboard.writeText(text)
    return "clipboard"
  } catch {
    return "none"
  }
}

export const shareCount = (items: CountRow[], sessionName: string) =>
  shareWith(
    countToCSV(items),
    `${safeName(sessionName)}_${todayStr()}.csv`,
    `Stok Sayım — ${sessionName}`,
    buildCountText(items, sessionName)
  )

export const shareCompare = (rows: CompareRow[], sessionName: string) =>
  shareWith(
    compareToCSV(rows),
    `karsilastirma_${safeName(sessionName)}_${todayStr()}.csv`,
    `Stok Karşılaştırma — ${sessionName}`,
    buildCompareText(rows, sessionName)
  )

// ------------------------------------------------- Mağaza modu raporu

export interface StoreReportRow {
  barcode: string
  name: string | null
  category: string | null
  expected: number | null
  counted: number
  status: CompareRow["status"]
}

const storeDiffText = (r: StoreReportRow) => {
  if (r.status === "only-count") return `+${r.counted}`
  if (r.expected == null) return ""
  const d = r.counted - r.expected
  return d > 0 ? `+${d}` : String(d)
}

export const storeReportToCSV = (rows: StoreReportRow[]) =>
  [
    "Barkod;Ürün Adı;Kategori;Beklenen;Sayılan;Fark;Durum",
    ...rows.map(r =>
      [
        csvCell(r.barcode),
        csvCell(r.name ?? ""),
        csvCell(r.category ?? ""),
        r.expected ?? "",
        r.counted,
        storeDiffText(r),
        STATUS_TEXT[r.status],
      ].join(";")
    ),
  ].join("\r\n")

const storeFileBase = (storeName: string, sessionName: string) =>
  `stokzen_${safeName(storeName)}_${safeName(sessionName)}_${todayStr()}`

export const downloadStoreReportCSV = (
  rows: StoreReportRow[],
  storeName: string,
  sessionName: string
) => {
  const blob = new Blob(["﻿" + storeReportToCSV(rows)], {
    type: "text/csv;charset=utf-8;",
  })
  downloadBlob(blob, `${storeFileBase(storeName, sessionName)}.csv`)
}

export const downloadStoreReportXLSX = async (
  rows: StoreReportRow[],
  storeName: string,
  sessionName: string
) => {
  const XLSX = await import("xlsx")
  const ws = XLSX.utils.aoa_to_sheet([
    ["Barkod", "Ürün Adı", "Kategori", "Beklenen", "Sayılan", "Fark", "Durum"],
    ...rows.map(r => [
      r.barcode,
      r.name ?? "",
      r.category ?? "",
      r.expected ?? "",
      r.counted,
      storeDiffText(r),
      STATUS_TEXT[r.status],
    ]),
  ])
  ws["!cols"] = [
    { wch: 18 },
    { wch: 32 },
    { wch: 16 },
    { wch: 10 },
    { wch: 10 },
    { wch: 8 },
    { wch: 12 },
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Sayım Raporu")
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array", compression: true })
  downloadBlob(
    new Blob([out], { type: XLSX_MIME }),
    `${storeFileBase(storeName, sessionName)}.xlsx`
  )
}

export const shareStoreReport = (
  rows: StoreReportRow[],
  storeName: string,
  sessionName: string
) =>
  shareWith(
    storeReportToCSV(rows),
    `${storeFileBase(storeName, sessionName)}.csv`,
    `Stokzen Sayım — ${storeName} / ${sessionName}`,
    `📊 Stokzen Sayım — ${storeName} / ${sessionName} (${dateTimeStr()})\n` +
      `Eşit: ${rows.filter(r => r.status === "match").length} · ` +
      `Sorunlu: ${rows.filter(r => r.status !== "match").length}\n\n` +
      rows
        .filter(r => r.status !== "match")
        .slice(0, 200)
        .map(
          r =>
            `${r.barcode} ${r.name ?? ""}: beklenen ${r.expected ?? "-"}, sayılan ${r.counted} — ${STATUS_TEXT[r.status]}`
        )
        .join("\n")
  )
