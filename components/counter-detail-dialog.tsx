"use client"

import { Search } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { ActivityFeed } from "@/components/activity-log"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { apiCounterDetail, type CounterDetail } from "@/lib/store-client/api"
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

  return (
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
                  <span className="text-base font-bold tabular-nums">{r.qty.toLocaleString("tr-TR")}</span>
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
  )
}
