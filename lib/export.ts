// Dışa aktarma ve paylaşma yardımcıları: XLSX, CSV, PDF (yazdırma) ve Web Share.

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

const todayStr = () => new Date().toISOString().split("T")[0]

const dateTimeStr = () =>
  new Date().toLocaleString("tr-TR", {
    dateStyle: "long",
    timeStyle: "short",
  })

// Dosya adında sorun çıkarmayacak bir oturum adı üret
const safeName = (name: string) =>
  name
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 40) || "sayim"

const escHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

// Noktalı virgül/çift tırnak içeren değerleri güvenli yaz
const csvCell = (v: string | number) => {
  const s = String(v)
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
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" })
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
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" })
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

// ---------------------------------------------------------------- PDF (yazdırma penceresi)

const PRINT_STYLE = `
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #111; margin: 24px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .meta { color: #555; font-size: 12px; margin-bottom: 4px; }
  .totals { font-size: 13px; margin: 10px 0 16px; }
  .totals b { font-size: 15px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { text-align: left; background: #f1f5f9; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 8px; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .mono { font-family: ui-monospace, Consolas, monospace; }
  tr.match td { background: #dcfce7; }
  tr.difference td { background: #fef3c7; }
  tr.only-stock td { background: #fee2e2; }
  tr.only-count td { background: #dbeafe; }
  @media print {
    body { margin: 10mm; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`

const openPrintWindow = (title: string, bodyHtml: string): boolean => {
  const w = window.open("", "_blank")
  if (!w) return false
  w.document.write(
    `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${escHtml(
      title
    )}</title><style>${PRINT_STYLE}</style></head><body>${bodyHtml}` +
      `<script>window.onload=function(){setTimeout(function(){window.print()},250)}</script></body></html>`
  )
  w.document.close()
  return true
}

export const printCountPDF = (
  items: CountRow[],
  sessionName: string
): boolean => {
  const totalQty = items.reduce((s, i) => s + i.quantity, 0)
  const rows = items
    .map(
      i =>
        `<tr><td class="mono">${escHtml(i.barcode)}</td><td class="num">${i.quantity}</td></tr>`
    )
    .join("")
  const body = `
    <h1>Stok Sayım Raporu</h1>
    <p class="meta">Sayım: ${escHtml(sessionName)} · ${escHtml(dateTimeStr())}</p>
    <p class="totals">Toplam ürün: <b>${totalQty}</b> &nbsp;·&nbsp; Farklı barkod: <b>${items.length}</b></p>
    <table><thead><tr><th>Barkod</th><th class="num">Adet</th></tr></thead><tbody>${rows}</tbody></table>`
  return openPrintWindow(`Stok Sayım - ${sessionName}`, body)
}

export const printComparePDF = (
  rows: CompareRow[],
  sessionName: string
): boolean => {
  const counts = {
    match: rows.filter(r => r.status === "match").length,
    difference: rows.filter(r => r.status === "difference").length,
    onlyStock: rows.filter(r => r.status === "only-stock").length,
    onlyCount: rows.filter(r => r.status === "only-count").length,
  }
  const trs = rows
    .map(
      r =>
        `<tr class="${r.status}"><td class="mono">${escHtml(r.barcode)}</td>` +
        `<td class="num">${r.stockQty || "-"}</td><td class="num">${r.countQty || "-"}</td>` +
        `<td class="num">${diffText(r)}</td><td>${STATUS_TEXT[r.status]}</td></tr>`
    )
    .join("")
  const body = `
    <h1>Stok Karşılaştırma Raporu</h1>
    <p class="meta">Sayım: ${escHtml(sessionName)} · ${escHtml(dateTimeStr())}</p>
    <p class="totals">Eşit: <b>${counts.match}</b> · Farklı: <b>${counts.difference}</b> · Sayılmadı: <b>${counts.onlyStock}</b> · Fazla: <b>${counts.onlyCount}</b></p>
    <table><thead><tr><th>Barkod</th><th class="num">Stok</th><th class="num">Sayım</th><th class="num">Fark</th><th>Durum</th></tr></thead><tbody>${trs}</tbody></table>`
  return openPrintWindow(`Karşılaştırma - ${sessionName}`, body)
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
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" })
  downloadBlob(
    new Blob([out], { type: XLSX_MIME }),
    `${storeFileBase(storeName, sessionName)}.xlsx`
  )
}

export const printStoreReportPDF = (
  rows: StoreReportRow[],
  storeName: string,
  sessionName: string
): boolean => {
  const counts = {
    match: rows.filter(r => r.status === "match").length,
    difference: rows.filter(r => r.status === "difference").length,
    onlyStock: rows.filter(r => r.status === "only-stock").length,
    onlyCount: rows.filter(r => r.status === "only-count").length,
  }
  const trs = rows
    .map(
      r =>
        `<tr class="${r.status}"><td class="mono">${escHtml(r.barcode)}</td>` +
        `<td>${escHtml(r.name ?? "-")}</td><td>${escHtml(r.category ?? "-")}</td>` +
        `<td class="num">${r.expected ?? "-"}</td><td class="num">${r.counted}</td>` +
        `<td class="num">${storeDiffText(r) || "-"}</td><td>${STATUS_TEXT[r.status]}</td></tr>`
    )
    .join("")
  const body = `
    <h1>Stokzen Sayım Raporu</h1>
    <p class="meta">Mağaza: ${escHtml(storeName)} · Sayım: ${escHtml(sessionName)} · ${escHtml(dateTimeStr())}</p>
    <p class="totals">Eşit: <b>${counts.match}</b> · Farklı: <b>${counts.difference}</b> · Sayılmadı: <b>${counts.onlyStock}</b> · Listede yok: <b>${counts.onlyCount}</b></p>
    <table><thead><tr><th>Barkod</th><th>Ürün Adı</th><th>Kategori</th><th class="num">Beklenen</th><th class="num">Sayılan</th><th class="num">Fark</th><th>Durum</th></tr></thead><tbody>${trs}</tbody></table>`
  return openPrintWindow(`Stokzen - ${storeName} - ${sessionName}`, body)
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
