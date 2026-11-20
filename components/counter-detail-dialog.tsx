"use client"

import { Minus, Search, Trash2 } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { ActivityFeed } from "@/components/activity-log"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { apiCounterDetail, apiDecreaseCounterItem, apiRemoveCounterItem, type CounterDetail } from "@/lib/store-client/api"
import { fmtQty, parseQtyInput, round2 } from "@/lib/qty"
import { fmtShort } from "@/lib/time"

// Bir sayımcı seçilince: neyi ne kadar saymış (ürün ürün) + hareketleri (kim ne yapmış).
export function CounterDetailDialog({
  token,
  sessionId,
  counter,
  onClose,
  onError,
}: {
  token: string
  sessionId?: string
  counter: string | null
  onClose: () => void
  onError: (err: unknown) => void
}) {
  const [tab, setTab] = useState("items")
  const [data, setData] = useState<CounterDetail | null>(null)
  const [search, setSearch] = useState("")
  const [limit, setLimit] = useState(100)
  const [loading, setLoading] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<{ barcode: string; name: string | null; qty: number } | null>(null)
  const [removing, setRemoving] = useState(false)
  const [adjustTarget, setAdjustTarget] = useState<{ barcode: string; name: string | null; qty: number } | null>(null)
  const [adjustInput, setAdjustInput] = useState("")
  const [adjusting, setAdjusting] = useState(false)
  const open = counter !== null

  useEffect(() => {
    if (open) {
      setTab("items")
      setSearch("")
      setLimit(100)
      setData(null)
    }
  }, [open, counter])

  const load = useCallback(async () => {
    if (!counter || !sessionId) return
    try {
      setData(await apiCounterDetail(token, { sessionId, counter, search: search.trim() || undefined, limit }))
    } catch (err) {
      onError(err)
    } finally {
      setLoading(false)
    }
  }, [token, sessionId, counter, search, limit, onError])

  useEffect(() => {
    if (!open || tab !== "items") return
    setLoading(true)
    const first = setTimeout(() => void load(), search ? 350 : 0) // aramada 350 ms bekle
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void load()
    }, 8000)
    return () => {
      clearTimeout(first)
      clearInterval(t)
    }
  }, [open, tab, load, search])

  const doAdjust = async () => {
    if (!adjustTarget || !counter || !sessionId || adjusting) return
    const n = parseQtyInput(adjustInput)
    if (!(n >= 0.01) || n >= adjustTarget.qty) {
      toast.error(`Yeni adet 0,01 ile ${fmtQty(adjustTarget.qty)} arasında (mevcuttan küçük) olmalı`)
      return
    }
    setAdjusting(true)
    try {
      await apiDecreaseCounterItem(token, { sessionId, counter, barcode: adjustTarget.barcode, qty: n })
      toast.success(`${adjustTarget.name ?? adjustTarget.barcode}: ${fmtQty(adjustTarget.qty)} → ${fmtQty(n)}`)
      setAdjustTarget(null)
      await load()
    } catch (err) {
      onError(err)
      toast.error(err instanceof Error ? err.message : "Düzeltilemedi")
    } finally {
      setAdjusting(false)
    }
  }

  const doRemove = async () => {
    if (!removeTarget || !counter || !sessionId || removing) return
    setRemoving(true)
    try {
      await apiRemoveCounterItem(token, { sessionId, counter, barcode: removeTarget.barcode })
      toast.success(`${counter}: ${removeTarget.name ?? removeTarget.barcode} sayımdan kaldırıldı`)
      setRemoveTarget(null)
      await load()
    } catch (err) {
      onError(err)
      toast.error(err instanceof Error ? err.message : "Kaldırılamadı")
      setRemoveTarget(null)
    } finally {
      setRemoving(false)
    }
  }

  return (
    <>
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-3 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{counter}</DialogTitle>
          {data && (
            <p className="text-sm text-muted-foreground">
              <b className="text-foreground">{data.totalQty.toLocaleString("tr-TR")}</b> adet ·{" "}
              <b className="text-foreground">{data.total.toLocaleString("tr-TR")}</b> çeşit
            </p>
          )}
        </DialogHeader>
        <Tabs value={tab} onValueChange={setTab} className="min-h-0 flex-1">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="items">Saydıkları</TabsTrigger>
            <TabsTrigger value="log">Hareketleri</TabsTrigger>
          </TabsList>
          <TabsContent value="items" className="mt-2 flex min-h-0 flex-col gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setLimit(100)
                }}
                placeholder="Barkod veya ürün ara..."
                className="h-9 pl-8"
              />
            </div>
            <ul className="max-h-[50vh] divide-y overflow-auto rounded-md border">
              {data && data.rows.length === 0 && !loading && (
                <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                  {search ? "Eşleşen ürün yok" : "Henüz ürün saymamış"}
                </li>
              )}
              {data?.rows.map((r) => (
                <li key={r.barcode} className="flex items-center gap-2 px-3 py-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium leading-tight">
                      {r.name ?? <span className="text-amber-700 dark:text-amber-400">Listede yok</span>}
                    </p>
                    <p className="font-mono text-[12px] leading-tight text-muted-foreground">
                      {r.barcode} · <span className="font-sans">{fmtShort(r.lastAt)}</span>
                    </p>
                  </div>
                  <span className="text-base font-bold tabular-nums">{fmtQty(r.qty)}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    disabled={r.qty < 0.02}
                    title="Adedi eksilt (yeni adet yaz)"
                    aria-label="Adedi eksilt"
                    onClick={() => {
                      setAdjustTarget({ barcode: r.barcode, name: r.name, qty: r.qty })
                      setAdjustInput(fmtQty(round2(Math.max(0.01, r.qty - 1))))
                    }}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                    title="Bu ürünü bu kişinin sayımından kaldır"
                    aria-label="Sayımdan kaldır"
                    onClick={() => setRemoveTarget({ barcode: r.barcode, name: r.name, qty: r.qty })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
              {!data && loading && (
                <li className="px-3 py-6 text-center text-sm text-muted-foreground">yükleniyor...</li>
              )}
            </ul>
            {data && data.total > data.rows.length && (
              <div className="text-center">
                <Button variant="ghost" size="sm" onClick={() => setLimit((l) => Math.min(1000, l + 100))}>
                  Daha fazla göster ({data.rows.length}/{data.total.toLocaleString("tr-TR")})
                </Button>
              </div>
            )}
          </TabsContent>
          <TabsContent value="log" className="mt-2 min-h-0">
            <div className="rounded-md border">
              <ActivityFeed
                token={token}
                sessionId={sessionId}
                actor={counter ?? undefined}
                active={open && tab === "log"}
                onError={onError}
              />
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
    <AlertDialog open={removeTarget !== null} onOpenChange={(o) => !o && !removing && setRemoveTarget(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Sayımdan kaldırılsın mı?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-1 text-sm text-muted-foreground">
              {removeTarget && (
                <>
                  <p className="font-medium text-foreground">{removeTarget.name ?? "Listede yok"}</p>
                  <p className="font-mono text-xs">{removeTarget.barcode}</p>
                  <p>
                    <b>{counter}</b> kişisinin saydığı <b>{fmtQty(removeTarget.qty)} adet</b> silinecek.
                    Kaydı hareket geçmişinde kalır. Kapalı sayımda kaldırılamaz.
                  </p>
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={removing}>Hayır, vazgeç</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            disabled={removing}
            onClick={(e) => {
              e.preventDefault()
              void doRemove()
            }}
          >
            {removing ? "Siliniyor..." : "Evet, sil"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <Dialog open={adjustTarget !== null} onOpenChange={(o) => !o && !adjusting && setAdjustTarget(null)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Adedi eksilt</DialogTitle>
        </DialogHeader>
        {adjustTarget && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void doAdjust()
            }}
            className="space-y-3"
          >
            <div className="rounded-md border bg-muted/40 px-3 py-2">
              <p className="text-sm font-medium">{adjustTarget.name ?? "Listede yok"}</p>
              <p className="font-mono text-xs text-muted-foreground">{adjustTarget.barcode}</p>
              <p className="text-sm">
                <b>{counter}</b> şu an <b>{fmtQty(adjustTarget.qty)}</b> adet saymış.
              </p>
            </div>
            <label className="block text-xs font-medium text-muted-foreground">
              Yeni adet (mevcuttan küçük olmalı, virgüllü olabilir)
            </label>
            <Input
              value={adjustInput}
              onChange={(e) => setAdjustInput(e.target.value.replace(/[^0-9,.]/g, ""))}
              inputMode="decimal"
              className="h-11 text-lg"
              autoFocus
            />
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" onClick={() => setAdjustTarget(null)} disabled={adjusting}>
                Vazgeç
              </Button>
              <Button type="submit" disabled={adjusting}>
                {adjusting ? "Kaydediliyor..." : "Kaydet"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
    </>
  )
}