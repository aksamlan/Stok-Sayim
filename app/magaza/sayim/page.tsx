"use client"

import {
  AlertTriangle,
  Camera,
  Check,
  CloudOff,
  Delete,
  ImageUp,
  Loader2,
  LogOut,
  Minus,
  Moon,
  Plus,
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
import Link from "next/link"
import { CameraScanner } from "@/components/camera-scanner"
import { PoweredByStokzen, StokzenLogo } from "@/components/stokzen"
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
import { AuthExpiredError } from "@/lib/store-client/api"
import {
  clearDeadEvents,
  ensureCatalog,
  enqueueScan,
  getDeadEvents,
  getMine,
  lastKnownSession,
  pruneMineExcept,
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
  const [qtyInput, setQtyInput] = useState("1")
  const qtyPristineRef = useRef(true)
  const [deleteTarget, setDeleteTarget] = useState<{ barcode: string; qty: number } | null>(null)
  const adjustBusyRef = useRef(false)
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
      } catch (err) {
        if (cancelled) return
        // Yalnız oturum hatasında çıkış yap; depolama/ağ hatasında kullanıcıyı
        // sebepsiz yere düşürme — boş katalogla devam et ve bilgilendir.
        if (err instanceof AuthExpiredError) {
          clearAuth()
          router.replace("/magaza")
          return
        }
        catalogRef.current = new Map()
        setCatalogReady(true)
        toast.error("Katalog yüklenemedi", {
          description:
            err instanceof Error && err.message.includes("sekme")
              ? err.message
              : "Ürün adları gösterilemeyebilir. Bağlantını kontrol edip sayfayı yenile.",
          duration: 8000,
        })
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
          void pruneMineExcept(a.storeId, active.id)
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

  // Arka plan senkronu + kapatılmış sayıma gidemeyen okutma uyarısı
  const lastDroppedRef = useRef(0)
  useEffect(() => {
    if (!auth) return
    const stop = startSync(auth, (s) => {
      setSync(s)
      const dropped = s.droppedTotal ?? 0
      if (dropped > lastDroppedRef.current) {
        const diff = dropped - lastDroppedRef.current
        lastDroppedRef.current = dropped
        toast.warning(`${diff} okutma gönderilemedi`, {
          description:
            "Ait olduğu sayım kapatılmış. Yönetici yeni sayım başlattıysa sayfa birazdan ona geçer.",
          duration: 8000,
        })
      }
    })
    return stop
  }, [auth])

  // Aktif sayımı düzenli kontrol et: yönetici kapatır/yenisini açarsa otomatik geç
  useEffect(() => {
    if (!auth) return
    const check = async () => {
      let active: { id: string; name: string } | null = null
      try {
        const { sessions } = await apiSessions(auth.token)
        const found = sessions.find((s) => s.status === "active")
        active = found ? { id: found.id, name: found.name } : null
      } catch {
        return // çevrimdışı: mevcut oturumla devam
      }
      const current = sessionRef.current
      if (active && active.id !== current?.id) {
        setSession(active)
        setNoSession(false)
        void rememberSession(auth.storeId, active.id, active.name)
        setItems(await getMine(auth.storeId, active.id))
        void pruneMineExcept(auth.storeId, active.id)
        setLastScan(null)
        toast.info(`Yeni sayıma geçildi: ${active.name}`)
      } else if (!active && current) {
        setSession(null)
        setNoSession(true)
        toast.warning("Yönetici sayımı kapattı")
      }
    }
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void check()
    }, 30000)
    return () => clearInterval(interval)
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
        setQtyInput("1")
        qtyPristineRef.current = true
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
      setQtyInput("1")
      qtyPristineRef.current = true
      setQtyDialogBarcode(code)
    }
  }

  // Hesap makinesi tuş takımı (normal sayımla aynı davranış)
  const pressQtyDigit = (d: string) => {
    setQtyInput((prev) => {
      if (qtyPristineRef.current) {
        qtyPristineRef.current = false
        return d
      }
      if (prev === "0" || prev === "") return d
      if (prev.length >= 5) return prev
      return prev + d
    })
  }
  const qtyBackspace = () => {
    qtyPristineRef.current = false
    setQtyInput((prev) => prev.slice(0, -1))
  }
  const qtyClear = () => {
    qtyPristineRef.current = false
    setQtyInput("")
  }
  const closeQtyDialog = () => {
    setQtyDialogBarcode(null)
    focusInput()
  }
  const confirmQtyInput = () => {
    const n = parseInt(qtyInput, 10)
    if (Number.isFinite(n) && n > 0) confirmQty(n)
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

  // Satırdaki +/−: tek tek artır/azalt. Adet 1'in altına inmez (silmek için ayrı,
  // onaylı çöp kutusu var); hızlı üst üste dokunmalar sıraya girer.
  const adjustItem = async (barcode: string, delta: 1 | -1) => {
    const a = authRef.current
    const s = sessionRef.current
    if (!a || !s || adjustBusyRef.current) return
    const existing = itemsRef.current.find((i) => i.barcode === barcode)
    if (!existing || existing.qty + delta < 1) return
    adjustBusyRef.current = true
    try {
      await enqueueScan(a.storeId, {
        id: crypto.randomUUID(),
        sessionId: s.id,
        barcode,
        qty: delta,
        createdAt: Date.now(),
      })
      const fresh = await getMine(a.storeId, s.id)
      itemsRef.current = fresh
      setItems(fresh)
    } finally {
      adjustBusyRef.current = false
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
          <div className="flex items-center gap-2 min-w-0">
            <Link href="/" title="Ana sayfa" className="shrink-0">
              <StokzenLogo className="h-7 w-7" />
            </Link>
            <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold tracking-tight truncate">
              {auth.storeName}
            </h1>
            <p className="text-xs text-muted-foreground truncate">
              {auth.role === "admin" ? "Yönetici" : auth.counter}
              {session ? ` · ${session.name}` : ""}
            </p>
            </div>
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

        {/* Gönderilemeyen okutmaların kurtarma bandı */}
        {(sync.deadTotal ?? 0) > 0 && (
          <div className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
              {sync.deadTotal} okutma kapatılmış bir sayıma aitti, gönderilemedi
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Kayıtlar cihazında güvende. CSV indirip yöneticine iletebilirsin.
            </p>
            <div className="flex gap-2 mt-2">
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                onClick={async () => {
                  if (!auth) return
                  const dead = await getDeadEvents(auth.storeId)
                  const csv =
                    "﻿Barkod;Adet;Zaman\r\n" +
                    dead
                      .map(
                        (d) =>
                          `${d.barcode};${d.qty};${new Date(d.createdAt).toLocaleString("tr-TR")}`
                      )
                      .join("\r\n")
                  const url = URL.createObjectURL(
                    new Blob([csv], { type: "text/csv;charset=utf-8;" })
                  )
                  const link = document.createElement("a")
                  link.href = url
                  link.download = `kurtarilan_okutmalar_${auth.counter || "yonetici"}.csv`
                  link.click()
                  URL.revokeObjectURL(url)
                }}
              >
                CSV İndir
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-muted-foreground"
                onClick={async () => {
                  if (!auth) return
                  await clearDeadEvents(auth.storeId)
                  setSync((s) => ({ ...s, deadTotal: 0 }))
                }}
              >
                Temizle
              </Button>
            </div>
          </div>
        )}

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
                    type="text"
                    autoFocus
                    autoComplete="off"
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
                          <TableHead className="h-9 text-xs text-right w-28">Adet</TableHead>
                          <TableHead className="h-9 w-11" />
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
                              <TableCell className="py-1.5">
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8"
                                    disabled={item.qty <= 1}
                                    onClick={() => void adjustItem(item.barcode, -1)}
                                    title="Bir azalt"
                                    aria-label="Bir azalt"
                                  >
                                    <Minus className="h-4 w-4" />
                                  </Button>
                                  <span className="min-w-8 text-center font-bold tabular-nums">
                                    {item.qty}
                                  </span>
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => void adjustItem(item.barcode, 1)}
                                    title="Bir artır"
                                    aria-label="Bir artır"
                                  >
                                    <Plus className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                              <TableCell className="py-1.5">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                  onClick={() => setDeleteTarget({ barcode: item.barcode, qty: item.qty })}
                                  title="Sil"
                                  aria-label="Ürünü sil"
                                >
                                  <Trash2 className="h-4 w-4" />
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

      {/* Adet penceresi: hesap makinesi tuş takımı (normal sayımla aynı) */}
      <Dialog
        open={qtyDialogBarcode !== null}
        onOpenChange={(open) => {
          if (!open) closeQtyDialog()
        }}
      >
        <DialogContent
          className="sm:max-w-sm"
          onCloseAutoFocus={(e) => {
            e.preventDefault()
            barcodeInputRef.current?.focus()
          }}
          onKeyDown={(e) => {
            if (e.key >= "0" && e.key <= "9") {
              e.preventDefault()
              pressQtyDigit(e.key)
            } else if (e.key === "Backspace") {
              e.preventDefault()
              qtyBackspace()
            } else if (e.key === "Enter") {
              e.preventDefault()
              confirmQtyInput()
            }
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScanBarcode className="h-5 w-5 text-primary" />
              Adet Girin
            </DialogTitle>
          </DialogHeader>
          {qtyDialogBarcode && (
            <>
              <div className="rounded-lg border bg-muted/40 px-3 py-2">
                <p className="text-sm font-medium">
                  {catalogRef.current?.get(qtyDialogBarcode)?.name ?? (
                    <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Listede yok
                    </span>
                  )}
                </p>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-xs text-muted-foreground break-all">
                    {qtyDialogBarcode}
                  </p>
                  {items.find((i) => i.barcode === qtyDialogBarcode) && (
                    <Badge variant="secondary">
                      Sayımda: {items.find((i) => i.barcode === qtyDialogBarcode)!.qty} adet
                    </Badge>
                  )}
                </div>
              </div>
              <div className="h-16 rounded-md border bg-muted/30 flex items-center justify-center font-mono text-4xl font-bold">
                {qtyInput || <span className="text-muted-foreground text-2xl">adet</span>}
              </div>
              <div className="grid grid-cols-4 gap-2">
                {QUICK_QTYS.map((q) => (
                  <Button
                    key={q}
                    type="button"
                    variant={qtyInput === String(q) ? "default" : "secondary"}
                    className="h-11 text-lg font-mono"
                    onClick={() => {
                      setQtyInput(String(q))
                      qtyPristineRef.current = true
                    }}
                  >
                    {q}
                  </Button>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                  <Button
                    key={d}
                    type="button"
                    variant="outline"
                    className="h-14 text-2xl font-mono"
                    onClick={() => pressQtyDigit(d)}
                  >
                    {d}
                  </Button>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  className="h-14 text-lg text-muted-foreground"
                  onClick={qtyClear}
                  title="Temizle"
                >
                  C
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-14 text-2xl font-mono"
                  onClick={() => pressQtyDigit("0")}
                >
                  0
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-14"
                  onClick={qtyBackspace}
                  title="Sil"
                >
                  <Delete className="h-6 w-6" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" className="h-12" onClick={closeQtyDialog}>
                  İptal
                </Button>
                <Button
                  type="button"
                  className="h-12 text-lg"
                  onClick={confirmQtyInput}
                  disabled={!qtyInput || parseInt(qtyInput, 10) < 1}
                >
                  <Plus className="h-5 w-5 mr-1.5" />
                  Ekle
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Silme onayı */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ürün sayımdan silinsin mi?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1 text-sm text-muted-foreground">
                {deleteTarget && (
                  <>
                    <p className="font-medium text-foreground">
                      {catalogRef.current?.get(deleteTarget.barcode)?.name ?? "Listede yok"}
                    </p>
                    <p className="font-mono text-xs">{deleteTarget.barcode}</p>
                    <p>
                      Saydığın <b>{deleteTarget.qty} adet</b> silinecek. Bu işlem geri alınamaz.
                    </p>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hayır, vazgeç</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                const t = deleteTarget
                setDeleteTarget(null)
                if (t) void handleDelete(t.barcode)
              }}
            >
              Evet, sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
