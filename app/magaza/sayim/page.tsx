"use client"

import {
  AlertTriangle,
  Camera,
  Check,
  CloudOff,
  ImageUp,
  Loader2,
  LogOut,
  Moon,
  RefreshCw,
  ScanBarcode,
  Search,
  Sun,
  Trash2,
  Zap,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { Toaster, toast } from "sonner"
import { CameraScanner } from "@/components/camera-scanner"
import { PoweredByStokzen } from "@/components/stokzen"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { decodeBarcodeFromImage } from "@/lib/barcode-image"
import { apiMyCounts, apiSessions } from "@/lib/store-client/api"
import {
  ensureCatalog,
  enqueueScan,
  getMine,
  lastKnownSession,
  rememberSession,
  seedMine,
  startSync,
} from "@/lib/store-client/offline"
import { clearAuth, loadAuth } from "@/lib/store-client/session"
import type { CatalogEntry, StoreAuth, SyncState } from "@/lib/store-client/types"
import { useDarkMode } from "@/lib/store-client/use-dark-mode"

type OwnItem = { barcode: string; qty: number; lastAt: number }

type LastScan = {
  barcode: string
  name: string | null
  category: string | null
  qty: number
  total: number
}

const QUICK_QTYS = [1, 5, 10, 20]

export default function SayimPage() {
  const router = useRouter()
  const [dark, toggleDark] = useDarkMode()
  const [auth, setAuth] = useState<StoreAuth | null>(null)
  const [loadingMsg, setLoadingMsg] = useState("Yükleniyor...")
  const [session, setSession] = useState<{ id: string; name: string } | null>(null)
  const [noSession, setNoSession] = useState(false)
  const [items, setItems] = useState<OwnItem[]>([])
  const [lastScan, setLastScan] = useState<LastScan | null>(null)
  const [sync, setSync] = useState<SyncState>({
    pending: 0,
    lastOkAt: null,
    online: true,
  })
  const [barcodeInput, setBarcodeInput] = useState("")
  const [quickMode, setQuickMode] = useState(false)
  const [quickQty, setQuickQty] = useState(1)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [qtyDialogBarcode, setQtyDialogBarcode] = useState<string | null>(null)
  const [qtyInput, setQtyInput] = useState("")
  const [search, setSearch] = useState("")

  const catalogRef = useRef<Map<string, CatalogEntry> | null>(null)
  const [catalogReady, setCatalogReady] = useState(false)
  const barcodeInputRef = useRef<HTMLInputElement>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const sessionRef = useRef<typeof session>(null)
  const authRef = useRef<StoreAuth | null>(null)
  const itemsRef = useRef<OwnItem[]>([])
  sessionRef.current = session
  authRef.current = auth
  itemsRef.current = items

  // Giriş kontrolü + ilk yükleme
  useEffect(() => {
    const a = loadAuth()
    if (!a) {
      router.replace("/magaza")
      return
    }
    setAuth(a)

    let cancelled = false
    const init = async () => {
      try {
        const map = await ensureCatalog(a, (msg) => !cancelled && setLoadingMsg(msg))
        if (cancelled) return
        catalogRef.current = map
        setCatalogReady(true)
      } catch {
        if (!cancelled) {
          clearAuth()
          router.replace("/magaza")
          return
        }
      }

      // Aktif oturumu bul (çevrimdışıysa son bilineni kullan)
      try {
        const { sessions } = await apiSessions(a.token)
        if (cancelled) return
        const active = sessions.find((s) => s.status === "active")
        if (active) {
          setSession({ id: active.id, name: active.name })
          void rememberSession(a.storeId, active.id, active.name)
          // Yeni cihaz: kendi sayımlarını sunucudan tohumla
          const mine = await getMine(a.storeId, active.id)
          if (mine.length === 0) {
            try {
              const { items: serverItems } = await apiMyCounts(a.token, active.id)
              if (serverItems.length > 0) {
                await seedMine(a.storeId, active.id, serverItems)
              }
            } catch {}
          }
          if (!cancelled) setItems(await getMine(a.storeId, active.id))
        } else {
          setNoSession(true)
        }
      } catch {
        const last = await lastKnownSession(a.storeId)
        if (cancelled) return
        if (last) {
          setSession({ id: last.sessionId, name: last.name })
          setItems(await getMine(a.storeId, last.sessionId))
        } else {
          setNoSession(true)
        }
      }
    }
    void init()
    return () => {
      cancelled = true
    }
  }, [router])

  // Arka plan senkronu
  useEffect(() => {
    if (!auth) return
    const stop = startSync(auth, setSync)
    return stop
  }, [auth])

  const focusInput = useCallback(() => {
    setTimeout(() => barcodeInputRef.current?.focus(), 50)
  }, [])

  const addBarcode = useCallback(
    async (rawCode: string, qty: number) => {
      const a = authRef.current
      const s = sessionRef.current
      if (!a || !s || qty === 0) return
      const barcode = rawCode.trim()
      if (!barcode) return

      const entry = catalogRef.current?.get(barcode) ?? null
      const existing = itemsRef.current.find((i) => i.barcode === barcode)
      const total = (existing?.qty ?? 0) + qty

      await enqueueScan(a.storeId, {
        id: crypto.randomUUID(),
        sessionId: s.id,
        barcode,
        qty,
        createdAt: Date.now(),
      })
      setItems(await getMine(a.storeId, s.id))
      setLastScan({
        barcode,
        name: entry?.name ?? null,
        category: entry?.category ?? null,
        qty,
        total,
      })
      if (!entry) {
        toast.warning("Bu barkod ürün listesinde yok", { duration: 2000 })
      }
    },
    []
  )

  const handleDetected = useCallback(
    (code: string) => {
      if (quickMode) {
        void addBarcode(code, quickQty)
      } else {
        setQtyInput("")
        setQtyDialogBarcode(code)
      }
    },
    [quickMode, quickQty, addBarcode]
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const code = barcodeInput.trim()
    if (!code) return
    setBarcodeInput("")
    if (quickMode) {
      void addBarcode(code, quickQty)
      focusInput()
    } else {
      setQtyInput("")
      setQtyDialogBarcode(code)
    }
  }

  const confirmQty = (qty: number) => {
    const code = qtyDialogBarcode
    setQtyDialogBarcode(null)
    if (code && qty > 0) void addBarcode(code, qty)
    focusInput()
  }

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setPhotoBusy(true)
    const toastId = toast.loading("Fotoğraf taranıyor...")
    try {
      const code = await decodeBarcodeFromImage(file)
      toast.dismiss(toastId)
      if (code) {
        handleDetected(code)
      } else {
        toast.error("Fotoğrafta barkod bulunamadı", {
          description: "Barkodu yakından, net ve düz çekmeyi dene.",
        })
      }
    } finally {
      toast.dismiss(toastId)
      setPhotoBusy(false)
    }
  }

  const handleDelete = async (barcode: string) => {
    const a = authRef.current
    const s = sessionRef.current
    if (!a || !s) return
    const existing = itemsRef.current.find((i) => i.barcode === barcode)
    if (!existing) return
    await enqueueScan(a.storeId, {
      id: crypto.randomUUID(),
      sessionId: s.id,
      barcode,
      qty: -existing.qty,
      createdAt: Date.now(),
    })
    setItems(await getMine(a.storeId, s.id))
  }

  const refreshSession = () => {
    window.location.reload()
  }

  const logout = () => {
    clearAuth()
    router.replace("/magaza")
  }

  if (!auth) return null

  const totalQty = items.reduce((sum, i) => sum + i.qty, 0)
  const filtered = search.trim()
    ? items.filter((i) => {
        const entry = catalogRef.current?.get(i.barcode)
        const q = search.trim().toLocaleLowerCase("tr")
        return (
          i.barcode.includes(search.trim()) ||
          (entry?.name ?? "").toLocaleLowerCase("tr").includes(q)
        )
      })
    : items

  const syncBadge = sync.authExpired ? (
    <button onClick={logout} className="inline-flex">
      <Badge variant="outline" className="bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30">
        Oturum doldu — tekrar gir
      </Badge>
    </button>
  ) : sync.pending > 0 ? (
    <Badge variant="outline" className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30">
      <CloudOff className="h-3 w-3 mr-1" />
      {sync.online ? `Gönderiliyor (${sync.pending})` : `Çevrimdışı — ${sync.pending} bekliyor`}
    </Badge>
  ) : (
    <Badge variant="outline" className="bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30">
      <Check className="h-3 w-3 mr-1" />
      Senkron
    </Badge>
  )

  return (
    <div className="min-h-screen bg-background">
      <Toaster position="top-center" richColors theme={dark ? "dark" : "light"} visibleToasts={3} />
      <div className="container mx-auto p-3 sm:p-5 max-w-3xl">
        {/* Üst bar */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold tracking-tight truncate">
              {auth.storeName}
            </h1>
            <p className="text-xs text-muted-foreground truncate">
              {auth.role === "admin" ? "Yönetici" : auth.counter}
              {session ? ` · ${session.name}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {syncBadge}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              onClick={toggleDark}
              title={dark ? "Açık Tema" : "Koyu Tema"}
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              onClick={logout}
              title="Çıkış"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {!catalogReady || (!session && !noSession) ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin text-primary" />
              <p className="text-sm">{loadingMsg}</p>
            </CardContent>
          </Card>
        ) : noSession ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              <ScanBarcode className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="font-medium">Aktif sayım yok</p>
              <p className="text-sm mt-1 mb-4">
                Yönetici panodan sayım başlattığında burada görünecek.
              </p>
              <Button variant="outline" size="sm" onClick={refreshSession}>
                <RefreshCw className="h-4 w-4 mr-1" />
                Yenile
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Son okutulan */}
            {lastScan && (
              <div
                className={`mb-3 flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${
                  lastScan.name === null
                    ? "border-amber-500/40 bg-amber-500/10"
                    : "border-primary/25 bg-primary/5"
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {lastScan.name === null ? (
                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  ) : (
                    <ScanBarcode className="h-4 w-4 text-primary shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {lastScan.name ?? "Listede yok"}
                      {lastScan.category && (
                        <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                          {lastScan.category}
                        </span>
                      )}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground truncate">
                      {lastScan.barcode}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-bold tabular-nums leading-tight">
                    {lastScan.total}
                  </p>
                  <p className="text-[10px] text-muted-foreground">+{lastScan.qty} adet</p>
                </div>
              </div>
            )}

            {/* Barkod girişi */}
            <Card className="mb-3 py-0 gap-0">
              <CardContent className="p-3">
                <form onSubmit={handleSubmit} className="flex gap-2">
                  <Input
                    ref={barcodeInputRef}
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    placeholder="Barkod okut veya yaz..."
                    className="h-11 font-mono"
                    autoFocus
                    autoComplete="off"
                    inputMode="numeric"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-11 w-11 shrink-0"
                    onClick={() => setCameraOpen(true)}
                    title="Kamera ile okut"
                  >
                    <Camera className="h-5 w-5" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-11 w-11 shrink-0"
                    disabled={photoBusy}
                    onClick={() => photoInputRef.current?.click()}
                    title="Fotoğraftan okut"
                  >
                    {photoBusy ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <ImageUp className="h-5 w-5" />
                    )}
                  </Button>
                  <Button type="submit" className="h-11 shrink-0">
                    Ekle
                  </Button>
                </form>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handlePhoto}
                />
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  <Button
                    type="button"
                    variant={quickMode ? "default" : "ghost"}
                    size="sm"
                    className="h-8"
                    onClick={() => setQuickMode(!quickMode)}
                  >
                    <Zap className="h-3.5 w-3.5 mr-1" />
                    Hızlı Mod
                  </Button>
                  {quickMode &&
                    QUICK_QTYS.map((q) => (
                      <Button
                        key={q}
                        type="button"
                        variant={quickQty === q ? "secondary" : "ghost"}
                        size="sm"
                        className="h-8 w-10 tabular-nums"
                        onClick={() => setQuickQty(q)}
                      >
                        {q}
                      </Button>
                    ))}
                  {quickMode && (
                    <span className="text-[11px] text-muted-foreground">
                      her okutma +{quickQty}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Özet çipler */}
            <div className="flex items-center gap-2 mb-3">
              <div className="rounded-lg border bg-card px-3 py-1.5">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Toplam Adet
                </p>
                <p className="text-lg font-bold tabular-nums leading-tight">{totalQty}</p>
              </div>
              <div className="rounded-lg border bg-card px-3 py-1.5">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Farklı Barkod
                </p>
                <p className="text-lg font-bold tabular-nums leading-tight">{items.length}</p>
              </div>
            </div>

            {/* Arama */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Listende ara..."
                className="pl-9 h-10 bg-card"
              />
            </div>

            {/* Kendi listesi */}
            <Card className="py-0 gap-0 overflow-hidden">
              <CardContent className="p-0">
                {filtered.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <ScanBarcode className="h-10 w-10 mx-auto mb-3 opacity-40" />
                    <p className="font-medium">
                      {items.length === 0 ? "Henüz ürün saymadın" : "Sonuç yok"}
                    </p>
                    {items.length === 0 && (
                      <p className="text-sm mt-1">Barkod okutarak başla</p>
                    )}
                  </div>
                ) : (
                  <div className="max-h-[50vh] overflow-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-card z-10 shadow-[0_1px_0_0_var(--border)]">
                        <TableRow>
                          <TableHead className="h-9 text-xs">Ürün</TableHead>
                          <TableHead className="h-9 text-xs text-right w-16">Adet</TableHead>
                          <TableHead className="h-9 w-10" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filtered.map((item) => {
                          const entry = catalogRef.current?.get(item.barcode)
                          return (
                            <TableRow key={item.barcode}>
                              <TableCell className="py-1.5">
                                <p className="text-sm font-medium leading-tight">
                                  {entry?.name ?? (
                                    <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
                                      <AlertTriangle className="h-3.5 w-3.5" />
                                      Listede yok
                                    </span>
                                  )}
                                  {entry?.category && (
                                    <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                                      {entry.category}
                                    </span>
                                  )}
                                </p>
                                <p className="font-mono text-[13px] text-muted-foreground leading-tight">
                                  {item.barcode}
                                </p>
                              </TableCell>
                              <TableCell className="py-1.5 text-right font-bold tabular-nums">
                                {item.qty}
                              </TableCell>
                              <TableCell className="py-1.5">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive hover:text-destructive"
                                  onClick={() => void handleDelete(item.barcode)}
                                  title="Sil"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        <PoweredByStokzen />
      </div>

      <CameraScanner
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onDetected={handleDetected}
        continuous={quickMode}
        continuousHint={`Hızlı mod: her okutmada ${quickQty} adet eklenir, kamera açık kalır`}
        onCloseAutoFocus={() => {
          if (!qtyDialogBarcode) barcodeInputRef.current?.focus()
        }}
      />

      {/* Adet penceresi */}
      <Dialog
        open={qtyDialogBarcode !== null}
        onOpenChange={(open) => {
          if (!open) {
            setQtyDialogBarcode(null)
            focusInput()
          }
        }}
      >
        <DialogContent
          className="sm:max-w-sm"
          onCloseAutoFocus={(e) => {
            e.preventDefault()
            barcodeInputRef.current?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScanBarcode className="h-5 w-5 text-primary" />
              Adet Girin
            </DialogTitle>
          </DialogHeader>
          {qtyDialogBarcode && (
            <div className="space-y-3">
              <div className="rounded-lg border bg-muted/40 px-3 py-2">
                <p className="text-sm font-medium">
                  {catalogRef.current?.get(qtyDialogBarcode)?.name ?? (
                    <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Listede yok
                    </span>
                  )}
                </p>
                <p className="font-mono text-xs text-muted-foreground">{qtyDialogBarcode}</p>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {QUICK_QTYS.map((q) => (
                  <Button
                    key={q}
                    variant="outline"
                    className="h-11 text-base tabular-nums"
                    onClick={() => confirmQty(q)}
                  >
                    {q}
                  </Button>
                ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  const n = parseInt(qtyInput, 10)
                  if (Number.isFinite(n) && n > 0) confirmQty(n)
                }}
                className="flex gap-2"
              >
                <Input
                  value={qtyInput}
                  onChange={(e) => setQtyInput(e.target.value.replace(/\D/g, ""))}
                  placeholder="Başka adet..."
                  inputMode="numeric"
                  className="h-11 text-base"
                  autoFocus
                />
                <Button type="submit" className="h-11">
                  Ekle
                </Button>
              </form>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
