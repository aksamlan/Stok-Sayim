"use client"

import {
  ArrowRight,
  Check,
  Copy,
  LogIn,
  LogOut,
  Moon,
  Store,
  Sun,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Toaster, toast } from "sonner"
import { PoweredByStokzen, StokzenWordmark } from "@/components/stokzen"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { apiCreateStore, apiJoinStore } from "@/lib/store-client/api"
import { clearAuth, loadAuth, saveAuth } from "@/lib/store-client/session"
import type { StoreAuth } from "@/lib/store-client/types"
import { useDarkMode } from "@/lib/store-client/use-dark-mode"

export default function MagazaPage() {
  const router = useRouter()
  const [dark, toggleDark] = useDarkMode()
  const [existing, setExisting] = useState<StoreAuth | null>(null)
  const [busy, setBusy] = useState(false)

  const [joinCode, setJoinCode] = useState("")
  const [joinPassword, setJoinPassword] = useState("")
  const [joinName, setJoinName] = useState("")

  const [newName, setNewName] = useState("")
  const [countPw, setCountPw] = useState("")
  const [adminPw, setAdminPw] = useState("")
  const [adminPw2, setAdminPw2] = useState("")
  const [createdCode, setCreatedCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setExisting(loadAuth())
  }, [])

  const target = (role: "counter" | "admin") =>
    role === "admin" ? "/magaza/panel" : "/magaza/sayim"

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      const res = await apiJoinStore({
        code: joinCode,
        password: joinPassword,
        counterName: joinName,
      })
      saveAuth({
        token: res.token,
        role: res.role,
        storeId: res.storeId,
        storeName: res.storeName,
        counter: res.role === "counter" ? joinName.trim() : "",
        code: joinCode.trim().toUpperCase(),
      })
      router.push(target(res.role))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Giriş başarısız")
      setBusy(false)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (adminPw !== adminPw2) {
      toast.error("Yönetici şifreleri birbirini tutmuyor")
      return
    }
    if (countPw === adminPw) {
      toast.error("Sayım şifresi ile yönetici şifresi farklı olmalı")
      return
    }
    setBusy(true)
    try {
      const res = await apiCreateStore({
        name: newName,
        countPassword: countPw,
        adminPassword: adminPw,
      })
      saveAuth({
        token: res.token,
        role: "admin",
        storeId: res.storeId,
        storeName: res.storeName,
        counter: "",
        code: res.code,
      })
      setCreatedCode(res.code)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Mağaza oluşturulamadı")
    } finally {
      setBusy(false)
    }
  }

  const copyCode = async () => {
    if (!createdCode) return
    try {
      await navigator.clipboard.writeText(createdCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error("Kopyalanamadı, kodu elle not et")
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Toaster position="top-center" richColors theme={dark ? "dark" : "light"} />
      <div className="container mx-auto p-3 sm:p-5 max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h1 className="flex items-center gap-2 text-lg sm:text-xl font-bold tracking-tight">
            <StokzenWordmark className="text-lg sm:text-xl" />
            <Badge variant="secondary" className="ml-1">
              Mağaza Modu
            </Badge>
          </h1>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              onClick={toggleDark}
              title={dark ? "Açık Tema" : "Koyu Tema"}
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {createdCode ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Store className="h-5 w-5 text-primary" />
                Mağaza hazır!
              </CardTitle>
              <CardDescription>
                Bu kodu sayım yapacak kişilere ver. Onlar kod + sayım şifresiyle
                girecek.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <button
                type="button"
                onClick={copyCode}
                className="w-full rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 py-5 text-center"
                title="Kopyala"
              >
                <span className="font-mono text-3xl font-bold tracking-[0.3em] text-primary">
                  {createdCode}
                </span>
                <span className="mt-1 flex items-center justify-center gap-1 text-xs text-muted-foreground">
                  {copied ? (
                    <>
                      <Check className="h-3 w-3" /> Kopyalandı
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" /> Kopyalamak için dokun
                    </>
                  )}
                </span>
              </button>
              <Button className="w-full h-11" onClick={() => router.push("/magaza/panel")}>
                Yönetici Panosuna Git
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {existing && (
              <Card className="mb-3 py-0 gap-0 border-primary/30">
                <CardContent className="px-3 py-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{existing.storeName}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {existing.role === "admin"
                        ? "Yönetici"
                        : `Sayımcı: ${existing.counter}`}{" "}
                      · Kod {existing.code}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="sm"
                      className="h-8"
                      onClick={() => router.push(target(existing.role))}
                    >
                      Devam Et
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-muted-foreground"
                      title="Çıkış yap"
                      onClick={() => {
                        clearAuth()
                        setExisting(null)
                      }}
                    >
                      <LogOut className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <Tabs defaultValue="join">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="join">Giriş</TabsTrigger>
                <TabsTrigger value="create">Mağaza Kur</TabsTrigger>
              </TabsList>

              <TabsContent value="join">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Sayıma katıl</CardTitle>
                    <CardDescription>
                      Mağaza kodu ve şifreyi yöneticinden al. Yönetici şifresiyle
                      girersen panoya gidersin.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleJoin} className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">
                          Mağaza Kodu
                        </label>
                        <Input
                          value={joinCode}
                          onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                          placeholder="ABC123"
                          className="h-11 font-mono tracking-widest uppercase"
                          autoCapitalize="characters"
                          autoComplete="off"
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">
                          Şifre
                        </label>
                        <Input
                          type="password"
                          value={joinPassword}
                          onChange={(e) => setJoinPassword(e.target.value)}
                          className="h-11"
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">
                          Adın (sayımcılar için)
                        </label>
                        <Input
                          value={joinName}
                          onChange={(e) => setJoinName(e.target.value)}
                          placeholder="örn. Ayşe"
                          className="h-11"
                          autoComplete="off"
                        />
                        <p className="text-[11px] text-muted-foreground">
                          Herkes farklı bir ad kullansın; sayımlar ada göre ayrılır.
                        </p>
                      </div>
                      <Button type="submit" className="w-full h-11" disabled={busy}>
                        <LogIn className="h-4 w-4 mr-1" />
                        {busy ? "Giriliyor..." : "Giriş Yap"}
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="create">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Yeni mağaza kur</CardTitle>
                    <CardDescription>
                      Sayım şifresini sayımcılara verirsin; yönetici şifresi sende
                      kalır.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleCreate} className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">
                          Mağaza Adı
                        </label>
                        <Input
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          placeholder="örn. Merkez Şube"
                          className="h-11"
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">
                          Sayım Şifresi
                        </label>
                        <Input
                          type="password"
                          value={countPw}
                          onChange={(e) => setCountPw(e.target.value)}
                          className="h-11"
                          minLength={4}
                          required
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">
                            Yönetici Şifresi
                          </label>
                          <Input
                            type="password"
                            value={adminPw}
                            onChange={(e) => setAdminPw(e.target.value)}
                            className="h-11"
                            minLength={4}
                            required
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">
                            Tekrar
                          </label>
                          <Input
                            type="password"
                            value={adminPw2}
                            onChange={(e) => setAdminPw2(e.target.value)}
                            className="h-11"
                            minLength={4}
                            required
                          />
                        </div>
                      </div>
                      <Button type="submit" className="w-full h-11" disabled={busy}>
                        <Store className="h-4 w-4 mr-1" />
                        {busy ? "Oluşturuluyor..." : "Mağazayı Oluştur"}
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            <p className="text-center text-xs text-muted-foreground mt-4">
              Tek kişilik yerel sayım için{" "}
              <Link href="/" className="text-primary underline underline-offset-2">
                ana sayfaya dön
              </Link>
            </p>
          </>
        )}
        <PoweredByStokzen />
      </div>
    </div>
  )
}
