"use client"

import {
  AlertTriangle,
  ChevronDown,
  KeyRound,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Copy,
  Download,
  Eraser,
  MoreVertical,
  Trash2,
  FileSpreadsheet,
  FileText,
  Loader2,
  LogOut,
  Moon,
  Play,
  Search,
  Share2,
  Square,
  Sun,
  Users,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { Toaster, toast } from "sonner"
import { PoweredByStokzen, StokzenWordmark } from "@/components/stokzen"
import { ActivityLog } from "@/components/activity-log"
import { CatalogUpload } from "@/components/catalog-upload"
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  downloadStoreReportCSV,
  downloadStoreReportXLSX,
  shareStoreReport,
  type ShareOutcome,
  type StoreReportRow,
} from "@/lib/export"
import {
  AuthExpiredError,
  apiCatalogCount,
  apiCloseSession,
  apiResetStore,
  apiCounters,
  apiCreateSession,
  apiDashboard,
  apiDashboardExport,
  apiResetCounterPin,
  apiSessions,
} from "@/lib/store-client/api"
import { clearAuth, loadAuth } from "@/lib/store-client/session"
import type {
  DashboardResult,
  SessionInfo,
  StoreAuth,
} from "@/lib/store-client/types"
import { useDarkMode } from "@/lib/store-client/use-dark-mode"

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  match: {
    label: "Eşit",
    cls: "bg-green-100 text-green-800 border-green-200 dark:bg-green-500/15 dark:text-green-400 dark:border-green-500/30",
  },
  difference: {
    label: "Farklı",
    cls: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/30",
  },
  "only-stock": {
    label: "Sayılmadı",
    cls: "bg-red-100 text-red-800 border-red-200 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/30",
  },
  "only-count": {
    label: "Listede yok",
    cls: "bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-500/15 dark:text-sky-400 dark:border-sky-500/30",
  },
}

function timeAgo(ts: number, now: number): string {
  const s = Math.max(0, Math.floor((now - ts) / 1000))
  if (s < 60) return "az önce"
  if (s < 3600) return `${Math.floor(s / 60)} dk önce`
  if (s < 86400) return `${Math.floor(s / 3600)} sa önce`
  return `${Math.floor(s / 86400)} gün önce`
}

export default function PanelPage() {
  const router = useRouter()
  const [dark, toggleDark] = useDarkMode()
  const [auth, setAuth] = useState<StoreAuth | null>(null)
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null)
  const [dash, setDash] = useState<DashboardResult | null>(null)
  const [filter, setFilter] = useState<"problems" | "all">("problems")
  const [category, setCategory] = useState("")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [newSessionOpen, setNewSessionOpen] = useState(false)
  const [newSessionName, setNewSessionName] = useState("")
  const [closeConfirm, setCloseConfirm] = useState(false)
  // Sunucu saati − cihaz saati: "x dk önce" cihaz saatinden bağımsız doğru olsun
  const [skew, setSkew] = useState(0)
  const [resetMode, setResetMode] = useState<"counts" | "all" | null>(null)
  const [resetText, setResetText] = useState("")
  const [resetBusy, setResetBusy] = useState(false)
  const [exportBusy, setExportBusy] = useState(false)
  const [catalogCount, setCatalogCount] = useState(0)
  const [registered, setRegistered] = useState<{ name: string; createdAt: number }[]>([])
  const searchRef = useRef(search)
  searchRef.current = search

  const [closedViewId, setClosedViewId] = useState<string | null>(null)

  const activeSession = sessions?.find((s) => s.status === "active") ?? null
  // Aktif sayım yoksa kapalı sayımlar salt okunur görüntülenip dışa aktarılabilir
  const closedSessions = sessions?.filter((s) => s.status === "closed") ?? []
  const viewSession =
    activeSession ??
    (closedSessions.find((s) => s.id === closedViewId) ?? closedSessions[0] ?? null)

  const handleAuthError = useCallback(
    (err: unknown): boolean => {
      if (err instanceof AuthExpiredError) {
        clearAuth()
        router.replace("/magaza")
        return true
      }
      return false
    },
    [router]
  )

  useEffect(() => {
    const a = loadAuth()
    if (!a || a.role !== "admin") {
      router.replace("/magaza")
      return
    }
    setAuth(a)
  }, [router])

  const refreshSessions = useCallback(async () => {
    if (!auth) return
    try {
      const { sessions } = await apiSessions(auth.token)
      setSessions(sessions)
    } catch (err) {
      if (!handleAuthError(err)) setSessions((s) => s ?? [])
    }
  }, [auth, handleAuthError])

  useEffect(() => {
    void refreshSessions()
  }, [refreshSessions])

  const refreshCatalogCount = useCallback(async () => {
    if (!auth) return
    try {
      const { count } = await apiCatalogCount(auth.token)
      setCatalogCount(count)
    } catch (err) {
      handleAuthError(err)
    }
  }, [auth, handleAuthError])

  useEffect(() => {
    void refreshCatalogCount()
  }, [refreshCatalogCount])

  const refreshCounters = useCallback(async () => {
    if (!auth) return
    try {
      const { counters } = await apiCounters(auth.token)
      setRegistered(counters)
    } catch (err) {
      handleAuthError(err)
    }
  }, [auth, handleAuthError])

  useEffect(() => {
    void refreshCounters()
  }, [refreshCounters])

  useEffect(() => {
    if (dash) setCatalogCount(dash.totals.catalogCount)
  }, [dash])

  const refreshDashboard = useCallback(async () => {
    if (!auth || !viewSession) return
    try {
      const d = await apiDashboard(auth.token, {
        sessionId: viewSession.id,
        filter,
        search: searchRef.current || undefined,
        category: category || undefined,
        page,
      })
      setDash(d)
      if (d.serverNow) setSkew(d.serverNow - Date.now())
    } catch (err) {
      handleAuthError(err)
    }
  }, [auth, viewSession, filter, category, page, handleAuthError])

  // İlk yükleme + filtre değişimi + 5 sn canlı yenileme
  useEffect(() => {
    void refreshDashboard()
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void refreshDashboard()
    }, 5000)
    return () => clearInterval(interval)
  }, [refreshDashboard])

  // Arama: 400 ms bekleyip yenile
  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1)
      void refreshDashboard()
    }, 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const startSession = async () => {
    if (!auth || !newSessionName.trim()) return
    try {
      await apiCreateSession(auth.token, newSessionName.trim())
      setNewSessionOpen(false)
      setNewSessionName("")
      setDash(null)
      await refreshSessions()
      toast.success("Sayım başlatıldı — sayımcılar artık görebilir")
    } catch (err) {
      if (!handleAuthError(err))
        toast.error(err instanceof Error ? err.message : "Başlatılamadı")
    }
  }

  const endSession = async () => {
    if (!auth || !activeSession) return
    try {
      await apiCloseSession(auth.token, activeSession.id)
      setCloseConfirm(false)
      await refreshSessions()
      toast.success("Sayım kapatıldı")
    } catch (err) {
      if (!handleAuthError(err))
        toast.error(err instanceof Error ? err.message : "Kapatılamadı")
    }
  }

  const runReset = async () => {
    if (!auth || !resetMode || resetBusy) return
    if (resetMode === "all" && resetText.trim().toUpperCase() !== "SIL") return
    if (resetMode === "counts" && !viewSession) return
    setResetBusy(true)
    try {
      const r =
        resetMode === "all"
          ? await apiResetStore(auth.token, { mode: "all", confirm: "SIL" })
          : await apiResetStore(auth.token, { mode: "counts", sessionId: viewSession!.id })
      setResetMode(null)
      setResetText("")
      setClosedViewId(null)
      setDash(null)
      setPage(1)
      await refreshSessions()
      await refreshCatalogCount()
      toast.success(
        resetMode === "all"
          ? "Her şey silindi — mağaza sıfırlandı"
          : `${r.removedEvents.toLocaleString("tr-TR")} okutma silindi, sayım temiz`
      )
    } catch (err) {
      if (!handleAuthError(err))
        toast.error(err instanceof Error ? err.message : "Temizlenemedi")
    } finally {
      setResetBusy(false)
    }
  }

  const fetchAllRows = async (): Promise<StoreReportRow[]> => {
    if (!auth || !viewSession) return []
    const all: StoreReportRow[] = []
    let p = 1
    for (;;) {
      const { rows, rowTotal } = await apiDashboardExport(
        auth.token,
        viewSession.id,
        p
      )
      all.push(...(rows as StoreReportRow[]))
      if (all.length >= rowTotal || rows.length === 0) break
      p++
    }
    return all
  }

  const runExport = async (kind: "xlsx" | "csv" | "share") => {
    if (!auth || !viewSession || exportBusy) return
    setExportBusy(true)
    try {
      const rows = await fetchAllRows()
      if (rows.length === 0) {
        toast.info("Aktarılacak veri yok")
        return
      }
      const store = auth.storeName
      const session = viewSession.name
      if (kind === "xlsx") {
        await downloadStoreReportXLSX(rows, store, session)
        toast.success("XLSX indirildi")
      } else if (kind === "csv") {
        downloadStoreReportCSV(rows, store, session)
        toast.success("CSV indirildi")
      } else {
        const outcome: ShareOutcome = await shareStoreReport(rows, store, session)
        if (outcome === "file" || outcome === "text") toast.success("Paylaşıldı")
        else if (outcome === "clipboard") toast.success("Panoya kopyalandı")
        else if (outcome === "none") toast.error("Paylaşım desteklenmiyor")
      }
    } catch (err) {
      if (!handleAuthError(err))
        toast.error(err instanceof Error ? err.message : "Dışa aktarma başarısız")
    } finally {
      setExportBusy(false)
    }
  }

  const logout = () => {
    clearAuth()
    router.replace("/magaza")
  }

  if (!auth) return null

  // Okutma yapmışlar + sadece kayıt olmuşlar tek listede (PIN yönetimi için)
  const counterRows = [
    ...(dash?.byCounter ?? []).map((c) => ({ ...c, lastAt: c.lastAt as number | null })),
    ...registered
      .filter((r) => !(dash?.byCounter ?? []).some((c) => c.counter === r.name))
      .map((r) => ({ counter: r.name, qty: 0, distinct: 0, lastAt: null as number | null })),
  ]

  const categories = (dash?.byCategory ?? [])
    .map((c) => c.category)
    .filter((c): c is string => c !== null)
  const hasCategories = categories.length > 0
  const pageCount = dash ? Math.max(1, Math.ceil(dash.rowTotal / 100)) : 1
  const staleCounters = (dash?.byCounter ?? [])
    .filter((c) => Date.now() - c.lastAt > 10 * 60 * 1000)
    .map((c) => c.counter)

  return (
    <div className="min-h-screen bg-background">
      <Toaster position="top-center" richColors theme={dark ? "dark" : "light"} visibleToasts={3} />
      <div className="container mx-auto p-3 sm:p-5 max-w-5xl">
        {/* Üst bar */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-base sm:text-lg font-bold tracking-tight">
              <Link href="/" title="Ana sayfa">
                <StokzenWordmark className="text-base sm:text-lg" />
              </Link>
              <span className="text-muted-foreground font-normal truncate">
                · {auth.storeName}
              </span>
            </h1>
            <p className="text-xs text-muted-foreground">
              Yönetici Panosu · Mağaza kodu:{" "}
              <button
                className="font-mono font-semibold text-primary inline-flex items-center gap-0.5"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(auth.code)
                    toast.success("Kod kopyalandı")
                  } catch {}
                }}
                title="Kopyala"
              >
                {auth.code}
                <Copy className="h-3 w-3" />
              </button>
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              onClick={toggleDark}
              title={dark ? "Açık Tema" : "Koyu Tema"}
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 shrink-0"
                  title="Temizlik"
                  aria-label="Temizlik seçenekleri"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {viewSession && (
                  <DropdownMenuItem onClick={() => setResetMode("counts")}>
                    <Eraser />
                    {activeSession ? "Sayımları temizle" : "Bu sayımı sil"}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => {
                    setResetText("")
                    setResetMode("all")
                  }}
                >
                  <Trash2 />
                  Komple sıfırla
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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

        {/* Oturum barı */}
        <Card className="mb-3 py-0 gap-0">
          <CardContent className="px-3 py-2 flex items-center gap-2 flex-wrap">
            <ClipboardList className="h-4 w-4 text-primary shrink-0" />
            {activeSession ? (
              <>
                <span className="text-sm font-medium">{activeSession.name}</span>
                <Badge variant="outline" className="bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30">
                  Aktif
                </Badge>
                <div className="ml-auto flex gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={() => setCloseConfirm(true)}
                  >
                    <Square className="h-3.5 w-3.5 mr-1" />
                    Sayımı Bitir
                  </Button>
                </div>
              </>
            ) : closedSessions.length > 0 ? (
              <>
                <select
                  value={viewSession?.id ?? ""}
                  onChange={(e) => {
                    setClosedViewId(e.target.value)
                    setDash(null)
                    setPage(1)
                  }}
                  className="h-8 rounded-md border bg-card px-2 text-sm max-w-48"
                >
                  {closedSessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <Badge variant="outline" className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30">
                  Kapalı — salt okunur
                </Badge>
                <div className="ml-auto">
                  <Button size="sm" className="h-8" onClick={() => setNewSessionOpen(true)}>
                    <Play className="h-3.5 w-3.5 mr-1" />
                    Yeni Sayım Başlat
                  </Button>
                </div>
              </>
            ) : (
              <>
                <span className="text-sm text-muted-foreground">
                  Aktif sayım yok
                </span>
                <div className="ml-auto">
                  <Button size="sm" className="h-8" onClick={() => setNewSessionOpen(true)}>
                    <Play className="h-3.5 w-3.5 mr-1" />
                    Yeni Sayım Başlat
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Katalog yükleme */}
        <CatalogUpload
          token={auth.token}
          catalogCount={catalogCount}
          onUploaded={() => {
            void refreshCatalogCount()
            void refreshDashboard()
          }}
        />

        {sessions === null ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin text-primary" />
              <p className="text-sm">Yükleniyor...</p>
            </CardContent>
          </Card>
        ) : !viewSession ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              <Play className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="font-medium">Sayım başlat, canlı pano burada açılır</p>
              <p className="text-sm mt-1">
                Sayımcılar mağaza kodu <span className="font-mono font-semibold">{auth.code}</span>{" "}
                ve sayım şifresiyle girer.
              </p>
            </CardContent>
          </Card>
        ) : !dash ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin text-primary" />
              <p className="text-sm">Pano yükleniyor...</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Canlı özet */}
            <div className="flex flex-col sm:flex-row items-stretch gap-2 mb-3">
              <div className="grid flex-1 grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 overflow-hidden rounded-lg border bg-card">
                <div className="px-3 py-2.5">
                  <p className="text-[11px] font-medium text-muted-foreground">Toplam adet</p>
                  <p className="text-2xl font-bold tabular-nums leading-tight">
                    {dash.totals.totalQty.toLocaleString("tr-TR")}
                  </p>
                </div>
                <div className="px-3 py-2.5">
                  <p className="text-[11px] font-medium text-muted-foreground">Sayılan çeşit</p>
                  <p className="text-2xl font-bold tabular-nums leading-tight">
                    {dash.totals.distinctCounted.toLocaleString("tr-TR")}
                    <span className="text-sm font-normal text-muted-foreground">
                      {" "}/ {dash.totals.catalogCount.toLocaleString("tr-TR")}
                    </span>
                  </p>
                </div>
                <div className="px-3 py-2.5">
                  <p className="text-[11px] font-medium text-muted-foreground">Sayımcı</p>
                  <p className="text-2xl font-bold tabular-nums leading-tight">{dash.totals.counters}</p>
                </div>
                <div className={`px-3 py-2.5 ${dash.totals.unknownCount > 0 ? "bg-amber-50 dark:bg-amber-500/10" : ""}`}>
                  <p className="text-[11px] font-medium text-muted-foreground">Listede yok</p>
                  <p className={`text-2xl font-bold tabular-nums leading-tight ${dash.totals.unknownCount > 0 ? "text-amber-700 dark:text-amber-400" : ""}`}>{dash.totals.unknownCount}</p>
                </div>
              </div>
              <div className="flex sm:items-stretch [&>*]:w-full sm:[&>*]:w-auto">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" className="h-10 sm:h-full sm:px-4" disabled={exportBusy}>
                      {exportBusy ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4 mr-1" />
                      )}
                      Dışa Aktar
                      <ChevronDown className="h-3.5 w-3.5 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => void runExport("xlsx")}>
                      <FileSpreadsheet /> Excel (.xlsx)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => void runExport("csv")}>
                      <FileText /> CSV
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => void runExport("share")}>
                      <Share2 /> Paylaş
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Sayımcılar */}
            <Card className="mb-3 py-0 gap-0 overflow-hidden">
              <CardContent className="p-0">
                <div className="px-3 py-2 border-b flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Sayımcılar</span>
                </div>
                {counterRows.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-muted-foreground">
                    Henüz kimse katılmadı.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="h-9 text-xs">Ad</TableHead>
                        <TableHead className="h-9 text-xs text-right">Adet</TableHead>
                        <TableHead className="h-9 text-xs text-right">Çeşit</TableHead>
                        <TableHead className="h-9 text-xs text-right">Son Okutma</TableHead>
                        <TableHead className="h-9 w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {counterRows.map((c) => (
                        <TableRow key={c.counter}>
                          <TableCell className="py-1.5 font-medium">{c.counter}</TableCell>
                          <TableCell className="py-1.5 text-right font-bold tabular-nums">
                            {c.qty.toLocaleString("tr-TR")}
                          </TableCell>
                          <TableCell className="py-1.5 text-right tabular-nums">{c.distinct}</TableCell>
                          <TableCell className="py-1.5 text-right text-xs text-muted-foreground">
                            {c.lastAt ? timeAgo(c.lastAt, Date.now() + skew) : "henüz okutmadı"}
                          </TableCell>
                          <TableCell className="py-1.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground"
                              title="PIN sıfırla (PIN'ini unuttuysa; sayımı silinmez)"
                              onClick={async () => {
                                if (!auth) return
                                try {
                                  await apiResetCounterPin(auth.token, c.counter)
                                  toast.success(
                                    `${c.counter} için PIN sıfırlandı — eski oturumu kapandı, yeni PIN'le tekrar girer`
                                  )
                                  void refreshCounters()
                                } catch (err) {
                                  if (!handleAuthError(err))
                                    toast.error(
                                      err instanceof Error ? err.message : "Sıfırlanamadı"
                                    )
                                }
                              }}
                            >
                              <KeyRound className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <ActivityLog
              token={auth.token}
              sessionId={viewSession?.id}
              people={counterRows.map((c) => c.counter)}
              onError={handleAuthError}
            />

            {/* Kategori kırılımı */}
            {hasCategories && (
              <Card className="mb-3 py-0 gap-0 overflow-hidden">
                <CardContent className="p-0">
                  <div className="px-3 py-2 border-b">
                    <span className="text-sm font-medium">Kategori Kırılımı</span>
                  </div>
                  <div className="max-h-64 overflow-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-card z-10 shadow-[0_1px_0_0_var(--border)]">
                        <TableRow>
                          <TableHead className="h-9 text-xs">Kategori</TableHead>
                          <TableHead className="h-9 text-xs text-right">Sayılan</TableHead>
                          <TableHead className="h-9 text-xs text-right">Beklenen</TableHead>
                          <TableHead className="h-9 text-xs text-right">Fark</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dash.byCategory.map((c) => {
                          const diff = c.counted - c.expected
                          return (
                            <TableRow key={c.category ?? "__none"}>
                              <TableCell className="py-1.5 font-medium">
                                {c.category ?? (
                                  <span className="text-muted-foreground">Kategorisiz / Listede yok</span>
                                )}
                              </TableCell>
                              <TableCell className="py-1.5 text-right font-bold tabular-nums">
                                {c.counted.toLocaleString("tr-TR")}
                              </TableCell>
                              <TableCell className="py-1.5 text-right tabular-nums">
                                {c.expected.toLocaleString("tr-TR")}
                              </TableCell>
                              <TableCell
                                className={`py-1.5 text-right tabular-nums font-medium ${
                                  diff === 0
                                    ? "text-green-700 dark:text-green-400"
                                    : "text-amber-700 dark:text-amber-400"
                                }`}
                              >
                                {diff > 0 ? `+${diff}` : diff}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Karşılaştırma */}
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <div className="flex rounded-lg border bg-card p-0.5">
                <Button
                  size="sm"
                  variant={filter === "problems" ? "secondary" : "ghost"}
                  className="h-7 text-xs"
                  onClick={() => {
                    setFilter("problems")
                    setPage(1)
                  }}
                >
                  <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                  Sorunlular
                </Button>
                <Button
                  size="sm"
                  variant={filter === "all" ? "secondary" : "ghost"}
                  className="h-7 text-xs"
                  onClick={() => {
                    setFilter("all")
                    setPage(1)
                  }}
                >
                  Tümü
                </Button>
              </div>
              {hasCategories && (
                <select
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value)
                    setPage(1)
                  }}
                  className="h-8 rounded-md border bg-card px-2 text-xs"
                >
                  <option value="">Tüm kategoriler</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              )}
              <div className="relative flex-1 min-w-40">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Barkod veya ürün ara..."
                  className="pl-8 h-8 text-sm bg-card"
                />
              </div>
            </div>

            <Card className="py-0 gap-0 overflow-hidden">
              <CardContent className="p-0">
                {dash.rows.length === 0 ? (
                  <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                    {filter === "problems"
                      ? "Sorunlu kayıt yok — her şey eşleşiyor 🎉"
                      : "Kayıt yok"}
                  </p>
                ) : (
                  <div className="max-h-[60vh] overflow-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-card z-10 shadow-[0_1px_0_0_var(--border)]">
                        <TableRow>
                          <TableHead className="h-9 text-xs">Ürün</TableHead>
                          {hasCategories && (
                            <TableHead className="h-9 text-xs hidden sm:table-cell">Kategori</TableHead>
                          )}
                          <TableHead className="h-9 text-xs text-right">Beklenen</TableHead>
                          <TableHead className="h-9 text-xs text-right">Sayılan</TableHead>
                          <TableHead className="h-9 text-xs">Durum</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dash.rows.map((r) => {
                          const badge = STATUS_BADGE[r.status]
                          return (
                            <TableRow key={r.barcode}>
                              <TableCell className="py-1.5">
                                <p className="text-sm font-medium leading-tight">
                                  {r.name ?? (
                                    <span className="text-amber-700 dark:text-amber-400">Listede yok</span>
                                  )}
                                </p>
                                <p className="font-mono text-[13px] text-muted-foreground leading-tight">
                                  {r.barcode}
                                </p>
                              </TableCell>
                              {hasCategories && (
                                <TableCell className="py-1.5 text-xs text-muted-foreground hidden sm:table-cell">
                                  {r.category ?? "—"}
                                </TableCell>
                              )}
                              <TableCell className="py-1.5 text-right tabular-nums">
                                {r.expected ?? "—"}
                              </TableCell>
                              <TableCell className="py-1.5 text-right font-bold tabular-nums">
                                {r.counted}
                              </TableCell>
                              <TableCell className="py-1.5">
                                <Badge variant="outline" className={badge.cls}>
                                  {badge.label}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
                {pageCount > 1 && (
                  <div className="flex items-center justify-between px-3 py-2 border-t text-xs text-muted-foreground">
                    <span>
                      {dash.rowTotal.toLocaleString("tr-TR")} kayıt · sayfa {page}/{pageCount}
                    </span>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 w-7 p-0"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => p - 1)}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 w-7 p-0"
                        disabled={page >= pageCount}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        <PoweredByStokzen />
      </div>

      {/* Yeni sayım */}
      <Dialog open={newSessionOpen} onOpenChange={setNewSessionOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Yeni Sayım Başlat</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void startSession()
            }}
            className="space-y-3"
          >
            <Input
              value={newSessionName}
              onChange={(e) => setNewSessionName(e.target.value)}
              placeholder="örn. Kasım 2026 Sayımı"
              className="h-11"
              autoFocus
              required
            />
            <p className="text-xs text-muted-foreground">
              Önceki aktif sayım varsa otomatik kapanır; verisi silinmez.
            </p>
            <Button type="submit" className="w-full h-10">
              Başlat
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Sayımı bitir onayı */}
      <AlertDialog open={closeConfirm} onOpenChange={setCloseConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sayımı bitir?</AlertDialogTitle>
            <AlertDialogDescription>
              Sayımcılar artık okutamaz. Sunucuya ulaşmış veriler silinmez ve
              panodan dışa aktarılabilir.
              {staleCounters.length > 0 && (
                <span className="block mt-2 font-medium text-amber-700 dark:text-amber-400">
                  Dikkat: {staleCounters.join(", ")} son 10 dakikadır veri
                  göndermedi — çevrimdışı sayıyor olabilirler. Kapatırsan
                  gönderemedikleri okutmalar sayıma işlenmez (cihazlarında CSV
                  olarak kurtarılabilir).
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction onClick={() => void endSession()}>
              Sayımı Bitir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Temizleme onayları */}
      <AlertDialog
        open={resetMode !== null}
        onOpenChange={(o) => {
          if (!o && !resetBusy) {
            setResetMode(null)
            setResetText("")
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {resetMode === "all"
                ? "Her şey silinsin mi?"
                : activeSession
                  ? "Sayımlar temizlensin mi?"
                  : "Bu sayım silinsin mi?"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                {resetMode === "all" ? (
                  <>
                    <p>
                      Bu mağazadaki <b>ürün listesi, tüm sayımlar, okutmalar ve sayımcı
                      kayıtları</b> kalıcı olarak silinir. Sayımcıların oturumu kapanır.
                      Mağaza kodu ve şifreler kalır.
                    </p>
                    <p className="font-medium text-destructive">Bu işlem geri alınamaz.</p>
                    <p>Onaylamak için aşağıya <b>SIL</b> yaz:</p>
                    <Input
                      value={resetText}
                      onChange={(e) => setResetText(e.target.value)}
                      placeholder="SIL"
                      autoComplete="off"
                      autoCapitalize="characters"
                      className="h-10"
                    />
                  </>
                ) : (
                  <>
                    <p>
                      <b>{viewSession?.name}</b> sayımındaki{" "}
                      <b>
                        {(dash?.totals.totalQty ?? 0).toLocaleString("tr-TR")} adetlik tüm
                        okutmalar
                      </b>{" "}
                      silinir.{" "}
                      {activeSession
                        ? "Aynı adla boş bir sayım açılır; ürün listesi ve sayımcılar kalır."
                        : "Ürün listesi ve sayımcılar kalır."}
                    </p>
                    <p className="font-medium text-destructive">Bu işlem geri alınamaz.</p>
                    {activeSession && staleCounters.length > 0 && (
                      <p className="font-medium text-amber-700 dark:text-amber-400">
                        {staleCounters.join(", ")} çevrimdışı sayıyor olabilir; gönderemedikleri
                        okutmalar yeni sayıma işlenmez.
                      </p>
                    )}
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetBusy}>Hayır, vazgeç</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={resetBusy || (resetMode === "all" && resetText.trim().toUpperCase() !== "SIL")}
              onClick={(e) => {
                e.preventDefault()
                void runReset()
              }}
            >
              {resetBusy ? "Siliniyor..." : "Evet, sil"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
