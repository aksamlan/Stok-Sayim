"use client"

import {
  Activity,
  KeyRound,
  Loader2,
  LogOut,
  Moon,
  ShieldCheck,
  Store,
  Sun,
  Trash2,
} from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { Toaster, toast } from "sonner"
import { PoweredByStokzen, StokzenWordmark } from "@/components/stokzen"
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useDarkMode } from "@/lib/store-client/use-dark-mode"

type StoreRow = {
  id: string
  code: string
  name: string
  createdAt: number
  catalogCount: number
  sessionCount: number
  counterCount: number
  eventCount: number
  totalQty: number
  lastActivity: number | null
}

type Overview = {
  stores: StoreRow[]
  recent: { storeName: string; counter: string; qty: number; at: number }[]
}

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (s < 60) return "az önce"
  if (s < 3600) return `${Math.floor(s / 60)} dk önce`
  if (s < 86400) return `${Math.floor(s / 3600)} sa önce`
  return `${Math.floor(s / 86400)} gün önce`
}

async function api<T>(
  path: string,
  options: { method?: string; token?: string; body?: unknown } = {}
): Promise<T> {
  const res = await fetch(path, {
    method: options.method ?? "GET",
    headers: {
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `Sunucu hatası (${res.status})`
    )
  }
  return data as T
}

export default function YonetimPage() {
  const [dark, toggleDark] = useDarkMode()
  const [token, setToken] = useState<string | null>(null)
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [data, setData] = useState<Overview | null>(null)
  const [resetTarget, setResetTarget] = useState<StoreRow | null>(null)
  const [resetWhich, setResetWhich] = useState<"count" | "admin">("count")
  const [resetPw, setResetPw] = useState("")
  const [deleteTarget, setDeleteTarget] = useState<StoreRow | null>(null)

  useEffect(() => {
    try {
      const t = sessionStorage.getItem("yonetimToken")
      if (t) setToken(t)
    } catch {}
  }, [])

  const refresh = useCallback(async () => {
    if (!token) return
    try {
      setData(await api<Overview>("/api/yonetim/overview", { token }))
    } catch (err) {
      if (err instanceof Error && /giriş|geçersiz/i.test(err.message)) {
        setToken(null)
        try {
          sessionStorage.removeItem("yonetimToken")
        } catch {}
      }
    }
  }, [token])

  useEffect(() => {
    void refresh()
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void refresh()
    }, 10000)
    return () => clearInterval(interval)
  }, [refresh])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      const { token: t } = await api<{ token: string }>("/api/yonetim/login", {
        method: "POST",
        body: { password },
      })
      try {
        sessionStorage.setItem("yonetimToken", t)
      } catch {}
      setToken(t)
      setPassword("")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Giriş başarısız")
    } finally {
      setBusy(false)
    }
  }

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token || !resetTarget) return
    try {
      await api("/api/yonetim/store", {
        method: "PATCH",
        token,
        body: { storeId: resetTarget.id, which: resetWhich, newPassword: resetPw },
      })
      toast.success(
        `${resetTarget.name}: ${resetWhich === "admin" ? "yönetici" : "sayım"} şifresi güncellendi`
      )
      setResetTarget(null)
      setResetPw("")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Güncellenemedi")
    }
  }

  const handleDelete = async () => {
    if (!token || !deleteTarget) return
    try {
      await api(`/api/yonetim/store?id=${encodeURIComponent(deleteTarget.id)}`, {
        method: "DELETE",
        token,
      })
      toast.success(`${deleteTarget.name} silindi`)
      setDeleteTarget(null)
      void refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Silinemedi")
    }
  }

  const logout = () => {
    setToken(null)
    setData(null)
    try {
      sessionStorage.removeItem("yonetimToken")
    } catch {}
  }

  const totalEvents = data?.stores.reduce((s, x) => s + x.eventCount, 0) ?? 0

  return (
    <div className="min-h-screen bg-background">
      <Toaster position="top-center" richColors theme={dark ? "dark" : "light"} />
      <div className="container mx-auto p-3 sm:p-5 max-w-5xl">
        <div className="flex items-center justify-between gap-2 mb-4">
          <h1 className="flex items-center gap-2 text-base sm:text-lg font-bold tracking-tight">
            <StokzenWordmark className="text-base sm:text-lg" />
            <Badge variant="secondary">
              <ShieldCheck className="h-3 w-3 mr-1" />
              Platform Yönetimi
            </Badge>
          </h1>
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
            {token && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground"
                onClick={logout}
                title="Çıkış"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {!token ? (
          <div className="max-w-sm mx-auto">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Yönetici Girişi</CardTitle>
                <CardDescription>
                  Şifre sunucuda <span className="font-mono text-xs">scripts/yonetici-sifre.mjs</span>{" "}
                  ile belirlenir.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleLogin} className="space-y-3">
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Platform yöneticisi şifresi"
                    className="h-11"
                    autoFocus
                    required
                  />
                  <Button type="submit" className="w-full h-11" disabled={busy}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                    Giriş Yap
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        ) : !data ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin text-primary" />
              <p className="text-sm">Yükleniyor...</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="flex items-stretch gap-2 mb-3 flex-wrap">
              <div className="rounded-lg border bg-card px-3 py-1.5">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Mağaza</p>
                <p className="text-lg font-bold tabular-nums leading-tight">{data.stores.length}</p>
              </div>
              <div className="rounded-lg border bg-card px-3 py-1.5">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Toplam Okutma</p>
                <p className="text-lg font-bold tabular-nums leading-tight">
                  {totalEvents.toLocaleString("tr-TR")}
                </p>
              </div>
            </div>

            <Card className="mb-3 py-0 gap-0 overflow-hidden">
              <CardContent className="p-0">
                <div className="px-3 py-2 border-b flex items-center gap-2">
                  <Store className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Mağazalar</span>
                </div>
                {data.stores.length === 0 ? (
                  <p className="px-3 py-6 text-sm text-muted-foreground">Henüz mağaza yok.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="h-9 text-xs">Mağaza</TableHead>
                          <TableHead className="h-9 text-xs text-right">Katalog</TableHead>
                          <TableHead className="h-9 text-xs text-right">Sayım</TableHead>
                          <TableHead className="h-9 text-xs text-right">Sayımcı</TableHead>
                          <TableHead className="h-9 text-xs text-right">Okutma</TableHead>
                          <TableHead className="h-9 text-xs text-right">Son Aktivite</TableHead>
                          <TableHead className="h-9 w-20" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.stores.map((s) => (
                          <TableRow key={s.id}>
                            <TableCell className="py-1.5">
                              <p className="text-sm font-medium leading-tight">{s.name}</p>
                              <p className="font-mono text-xs text-muted-foreground leading-tight">
                                {s.code}
                              </p>
                            </TableCell>
                            <TableCell className="py-1.5 text-right tabular-nums">
                              {s.catalogCount.toLocaleString("tr-TR")}
                            </TableCell>
                            <TableCell className="py-1.5 text-right tabular-nums">{s.sessionCount}</TableCell>
                            <TableCell className="py-1.5 text-right tabular-nums">{s.counterCount}</TableCell>
                            <TableCell className="py-1.5 text-right tabular-nums">
                              {s.eventCount.toLocaleString("tr-TR")}
                            </TableCell>
                            <TableCell className="py-1.5 text-right text-xs text-muted-foreground">
                              {s.lastActivity ? timeAgo(s.lastActivity) : "—"}
                            </TableCell>
                            <TableCell className="py-1.5">
                              <div className="flex gap-0.5 justify-end">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  title="Şifre sıfırla"
                                  onClick={() => {
                                    setResetTarget(s)
                                    setResetWhich("count")
                                    setResetPw("")
                                  }}
                                >
                                  <KeyRound className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive hover:text-destructive"
                                  title="Mağazayı sil"
                                  onClick={() => setDeleteTarget(s)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="py-0 gap-0 overflow-hidden">
              <CardContent className="p-0">
                <div className="px-3 py-2 border-b flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Son Aktiviteler</span>
                </div>
                {data.recent.length === 0 ? (
                  <p className="px-3 py-6 text-sm text-muted-foreground">Henüz aktivite yok.</p>
                ) : (
                  <ul className="divide-y">
                    {data.recent.map((r, i) => (
                      <li key={i} className="px-3 py-1.5 flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate">
                          <span className="font-medium">{r.counter}</span>
                          <span className="text-muted-foreground"> · {r.storeName}</span>
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {r.qty > 0 ? `+${r.qty}` : r.qty} adet · {timeAgo(r.at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </>
        )}

        <PoweredByStokzen />
      </div>

      {/* Şifre sıfırlama */}
      <Dialog open={resetTarget !== null} onOpenChange={(o) => !o && setResetTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              Şifre Sıfırla — {resetTarget?.name}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleReset} className="space-y-3">
            <div className="flex rounded-lg border bg-card p-0.5">
              <Button
                type="button"
                size="sm"
                variant={resetWhich === "count" ? "secondary" : "ghost"}
                className="h-8 flex-1 text-xs"
                onClick={() => setResetWhich("count")}
              >
                Sayım Şifresi
              </Button>
              <Button
                type="button"
                size="sm"
                variant={resetWhich === "admin" ? "secondary" : "ghost"}
                className="h-8 flex-1 text-xs"
                onClick={() => setResetWhich("admin")}
              >
                Yönetici Şifresi
              </Button>
            </div>
            <Input
              type="text"
              value={resetPw}
              onChange={(e) => setResetPw(e.target.value)}
              placeholder="Yeni şifre"
              className="h-11"
              minLength={4}
              autoFocus
              required
            />
            <p className="text-xs text-muted-foreground">
              Yeni şifreyi mağaza sahibine ilet. Eski şifre anında geçersiz olur;
              açık oturumlar etkilenmez.
            </p>
            <Button type="submit" className="w-full h-10">
              Şifreyi Güncelle
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Mağaza silme */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteTarget?.name} silinsin mi?</AlertDialogTitle>
            <AlertDialogDescription>
              Mağazanın kataloğu, tüm sayım oturumları ve okutma kayıtları kalıcı
              olarak silinir. Bu işlem geri alınamaz.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => void handleDelete()}
            >
              Kalıcı Olarak Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
