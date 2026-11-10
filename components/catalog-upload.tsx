"use client"

import { FileSpreadsheet, Loader2, Upload } from "lucide-react"
import { useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { apiPutCatalog } from "@/lib/store-client/api"
import {
  buildCatalog,
  detectColumns,
  sheetToRows,
  type ColumnMap,
} from "@/lib/store-client/parse-catalog"

type Parsed = {
  fileName: string
  headers: string[]
  rows: unknown[][]
  cols: ColumnMap
}

const COLUMN_LABELS: { key: keyof ColumnMap; label: string; optional: boolean }[] = [
  { key: "barcode", label: "Barkod", optional: false },
  { key: "name", label: "Ürün Adı", optional: false },
  { key: "category", label: "Kategori", optional: true },
  { key: "expected", label: "Beklenen Stok", optional: true },
]

export function CatalogUpload({
  token,
  catalogCount,
  onUploaded,
}: {
  token: string
  catalogCount: number
  onUploaded: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [parsed, setParsed] = useState<Parsed | null>(null)
  const [busy, setBusy] = useState(false)

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    try {
      const { headers, rows } = await sheetToRows(file)
      if (rows.length === 0) {
        toast.error("Dosyada veri satırı bulunamadı")
        return
      }
      setParsed({ fileName: file.name, headers, rows, cols: detectColumns(headers) })
    } catch {
      toast.error("Dosya okunamadı — XLSX veya CSV olmalı")
    }
  }

  const setCol = (key: keyof ColumnMap, value: number) => {
    if (!parsed) return
    setParsed({ ...parsed, cols: { ...parsed.cols, [key]: value } })
  }

  const handleUpload = async () => {
    if (!parsed || busy) return
    const { items, errors } = buildCatalog(parsed.rows, parsed.cols)
    if (items.length === 0) {
      toast.error("Geçerli satır yok", {
        description: errors.slice(0, 3).join(" · "),
      })
      return
    }
    setBusy(true)
    try {
      const res = await apiPutCatalog(token, items)
      toast.success(`Katalog yüklendi: ${res.count} ürün`, {
        description:
          errors.length > 0
            ? `${errors.length} satır atlandı: ${errors.slice(0, 5).join(" · ")}${errors.length > 5 ? ` … ve ${errors.length - 5} daha` : ""}`
            : undefined,
        duration: errors.length > 0 ? 8000 : 3000,
      })
      setParsed(null)
      onUploaded()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Yükleme başarısız")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="mb-3 py-0 gap-0">
      <CardHeader className="px-3 pt-3 pb-0">
        <CardTitle className="text-sm flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-primary" />
          Ürün Listesi
          <span className="font-normal text-muted-foreground">
            {catalogCount > 0 ? `${catalogCount.toLocaleString("tr-TR")} ürün yüklü` : "henüz yüklenmedi"}
          </span>
        </CardTitle>
        <CardDescription className="text-xs">
          Barkod + ürün adı (+ kategori + beklenen stok) içeren XLSX/CSV yükle.
          Yeni yükleme eskisinin yerine geçer.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-3">
        {!parsed ? (
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-4 w-4 mr-1" />
            Dosya Seç
          </Button>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{parsed.fileName}</span> ·{" "}
              {parsed.rows.length.toLocaleString("tr-TR")} satır. Sütunları kontrol et:
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {COLUMN_LABELS.map(({ key, label, optional }) => (
                <div key={key} className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground">
                    {label}
                    {optional ? " (ops.)" : ""}
                  </label>
                  <select
                    value={parsed.cols[key]}
                    onChange={(e) => setCol(key, Number(e.target.value))}
                    className="w-full h-8 rounded-md border bg-background px-2 text-xs"
                  >
                    {optional && <option value={-1}>— Yok —</option>}
                    {parsed.headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h || `Sütun ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="rounded-md border overflow-x-auto">
              <table className="text-xs w-full">
                <tbody>
                  {parsed.rows.slice(0, 3).map((row, ri) => (
                    <tr key={ri} className="border-b last:border-0">
                      {[
                        parsed.cols.barcode,
                        parsed.cols.name,
                        parsed.cols.category,
                        parsed.cols.expected,
                      ].map((ci, k) => (
                        <td key={k} className="px-2 py-1 whitespace-nowrap">
                          {ci >= 0 ? String(row[ci] ?? "") : "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="h-9" disabled={busy} onClick={handleUpload}>
                {busy ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-1" />
                )}
                Yükle ({parsed.rows.length.toLocaleString("tr-TR")} satır)
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-9"
                disabled={busy}
                onClick={() => setParsed(null)}
              >
                Vazgeç
              </Button>
            </div>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={handleFile}
        />
      </CardContent>
    </Card>
  )
}
