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
import {
  apiCreateStore,
  apiJoinStore,
  apiJoinNames,
  apiStartVerification,
} from "@/lib/store-client/api"
import { loadAllAuths, removeAuth, saveAuth, switchAuth } from "@/lib/store-client/session"
import type { StoreAuth } from "@/lib/store-client/types"
import { useDarkMode } from "@/lib/store-client/use-dark-mode"

export default function MagazaPage() {
  const router = useRouter()
  const [dark, toggleDark] = useDarkMode()
  const [saved, setSaved] = useState<StoreAuth[]>([])
  const [busy, setBusy] = useState(false)

  const [joinCode, setJoinCode] = useState("")
  const [joinPassword, setJoinPassword] = useState("")
  const [joinName, setJoinName] = useState("")
  const [joinPin, setJoinPin] = useState("")
  const [joinRole, setJoinRole] = useState<"counter" | "admin">("counter")
  const [knownNames, setKnownNames] = useState<{ name: string; hasPin: boolean }[]>([])
  const [showPin, setShowPin] = useState(false)

  const [newName, setNewName] = useState("")
  const [newEmail, setNewEmail] = useState("")
  const [newPhone, setNewPhone] = useState("")
  // E-posta doğrulama adımı (SMTP ayarlıysa): kod istenir
  const [verifyToken, setVerifyToken] = useState<string | null>(null)
  const [verifyCode, setVerifyCode] = useState("")
  const [countPw, setCountPw] = useState("")
  const [adminPw, setAdminPw] = useState("")
  const [adminPw2, setAdminPw2] = useState("")
  const [createdCode, setCreatedCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setSaved(loadAllAuths())
    try {
      const last = JSON.parse(localStorage.getItem("magazaSon") ?? "null")
      if (last?.code) setJoinCode(String(last.code))
      if (last?.name) setJoinName(String(last.name))
    } catch {}
  }, [])

  // Kod + sayım şifresi girilince önceki sayımcı adlarını getir: kişi adını
  // yeniden yazmak yerine seçer, aynı kişi iki kez "yeni sayımcı" olmaz.
  useEffect(() => {
    if (joinRole !== "counter" || joinCode.trim().length < 4 || !joinPassword) {
      setKnownNames([])
      return
    }
    const t = setTimeout(() => {
      apiJoinNames({ code: joinCode, password: joinPassword })
        .then((r) => setKnownNames(r.counters))
        .catch(() => setKnownNames([]))
    }, 600)
    return () => clearTimeout(t)
  }, [joinRole, joinCode, joinPassword])

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
        counterName: joinRole === "admin" ? "" : joinName,
        pin: joinRole === "admin" ? "" : joinPin,
      })
      saveAuth({
        token: res.token,
        role: res.role,
        storeId: res.storeId,
        storeName: res.storeName,
        counter: res.role === "counter" ? (res.counter ?? joinName.trim()) : "",
        code: joinCode.trim().toUpperCase(),
      })
      try {
        localStorage.setItem(
          "magazaSon",
          JSON.stringify({
            code: joinCode.trim().toUpperCase(),
            name: res.role === "counter" ? (res.counter ?? joinName.trim()) : "",
          })
        )
      } catch {}
      router.push(target(res.role))
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Giriş başarısız"
      toast.error(
        joinRole === "admin" && msg.startsWith("Adını yazman")
          ? "Yönetici şifresi hatalı (sayım şifresi değil, yönetici şifresini yaz)"
          : msg
      )
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
      // Doğrulama gerekiyorsa önce e-postaya kod gönder, kod adımına geç
      if (verifyToken === null) {
        const v = await apiStartVerification(newEmail)
        if (v.required && v.token) {
          setVerifyToken(v.token)
          toast.info("Doğrulama kodu e-postana gönderildi")
          setBusy(false)
          return
        }
      }
      const res = await apiCreateStore({
        name: newName,
        countPassword: countPw,
        adminPassword: adminPw,
        email: newEmail,
        phone: newPhone,
        verifyToken: verifyToken ?? undefined,
        verifyCode: verifyCode || undefined,
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
            <Link href="/" title="Ana sayfa">
              <StokzenWordmark className="text-lg sm:text-xl" />
            </Link>
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
            {saved.length > 0 && (
              <div className="mb-3 space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">
                  Bu cihazda giriş yapılmış mağazalar
                </p>
                {saved.map((a) => (
                  <Card
                    key={`${a.storeId}|${a.role}|${a.counter}`}
                    className="py-0 gap-0 border-primary/30"
                  >
                    <CardContent className="px-3 py-2.5 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{a.storeName}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {a.role === "admin" ? "Yönetici" : `Sayımcı: ${a.counter}`} · Kod{" "}
                          <span className="font-mono font-semibold">{a.code}</span>
                        </p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button
                          size="sm"
                          className="h-8"
                          onClick={() => {
                            switchAuth(a)
                            router.push(target(a.role))
                          }}
                        >
                          Devam Et
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-muted-foreground"
                          title="Bu mağazadan çıkış yap"
                          aria-label={`${a.storeName} çıkış`}
                          onClick={() => {
                            removeAuth(a)
                            setSaved(loadAllAuths())
                          }}
                        >
                          <LogOut className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
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
                      Önce kim olduğunu seç. Mağaza kodunu yöneticiden alırsın.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleJoin} className="space-y-3">
                      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="radiogroup" aria-label="Giriş türü">
                        {([
                          ["counter", "Sayımcıyım"],
                          ["admin", "Yöneticiyim"],
                        ] as const).map(([r, label]) => (
                          <button
                            key={r}
                            type="button"
                            role="radio"
                            aria-checked={joinRole === r}
                            onClick={() => setJoinRole(r)}
                            className={`h-9 rounded-md text-sm font-semibold transition-colors ${
                              joinRole === r
                                ? "bg-card text-primary shadow-sm ring-1 ring-border"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <div className="space-y-1">
                        <label className="block text-xs font-medium text-muted-foreground">
                          Mağaza kodu
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
                        <label className="block text-xs font-medium text-muted-foreground">
                          {joinRole === "admin" ? "Yönetici şifresi" : "Sayım şifresi"}
                        </label>
                        <Input
                          type="password"
                          value={joinPassword}
                          onChange={(e) => setJoinPassword(e.target.value)}
                          className="h-11"
                          autoComplete="off"
                          required
                        />
                        {joinRole === "counter" && (
                          <p className="text-[11px] text-muted-foreground">
                            Mağaza yöneticisinin sana verdiği ortak şifre.
                          </p>
                        )}
                      </div>
                      {joinRole === "counter" && (
                        <>
                          <div className="space-y-1">
                            <label className="block text-xs font-medium text-muted-foreground">
                              Adın
                            </label>
                            <Input
                              value={joinName}
                              onChange={(e) => setJoinName(e.target.value)}
                              placeholder="örn. Ayşe"
                              className="h-11"
                              autoComplete="off"
                              required
                            />
                            {knownNames.length > 0 ? (
                              <div className="pt-1">
                                <p className="mb-1 text-[11px] text-muted-foreground">
                                  Daha önce giren sayımcılar — sen varsan dokun, yeni kayıt açılmaz:
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                  {knownNames.map((k) => (
                                    <button
                                      key={k.name}
                                      type="button"
                                      onClick={() => {
                                        setJoinName(k.name)
                                        setShowPin(k.hasPin)
                                      }}
                                      className={`rounded-md border px-2.5 py-1 text-sm font-medium transition-colors ${
                                        joinName.trim().toLocaleLowerCase("tr") ===
                                        k.name.toLocaleLowerCase("tr")
                                          ? "border-primary bg-primary text-primary-foreground"
                                          : "bg-card hover:border-primary hover:text-primary"
                                      }`}
                                    >
                                      {k.name}
                                      {k.hasPin && " 🔒"}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <p className="text-[11px] text-muted-foreground">
                                Aynı adı yazarsan aynı sayımcı olarak devam edersin (büyük/küçük
                                harf fark etmez).
                              </p>
                            )}
                          </div>
                          {showPin ||
                          knownNames.some(
                            (k) =>
                              k.hasPin &&
                              k.name.toLocaleLowerCase("tr") ===
                                joinName.trim().toLocaleLowerCase("tr")
                          ) ? (
                            <div className="space-y-1">
                              <label className="block text-xs font-medium text-muted-foreground">
                                Kişisel PIN (en az 4 rakam)
                              </label>
                              <Input
                                type="password"
                                value={joinPin}
                                onChange={(e) => setJoinPin(e.target.value)}
                                placeholder="Bu ad PIN ile korunuyor"
                                className="h-11"
                                inputMode="numeric"
                                autoComplete="off"
                                minLength={4}
                              />
                              <p className="text-[11px] text-muted-foreground">
                                İlk kez giriyorsan kendin belirle; sonra aynı ad + aynı PIN ile
                                girersin. Başkası senin adınla giremez.
                              </p>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setShowPin(true)}
                              className="text-xs font-medium text-primary underline underline-offset-2"
                            >
                              Adımı kişisel PIN ile koru (isteğe bağlı)
                            </button>
                          )}
                        </>
                      )}
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
                        <label className="block text-xs font-medium text-muted-foreground">
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
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-muted-foreground">
                            E-posta
                          </label>
                          <Input
                            type="email"
                            value={newEmail}
                            onChange={(e) => {
                              setNewEmail(e.target.value)
                              // E-posta değişti: eski doğrulama jetonu artık o
                              // adrese ait değil, kod adımını sıfırla
                              if (verifyToken !== null) {
                                setVerifyToken(null)
                                setVerifyCode("")
                              }
                            }}
                            placeholder="ornek@eposta.com"
                            className="h-11"
                            required
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-muted-foreground">
                            Telefon
                          </label>
                          <Input
                            type="tel"
                            value={newPhone}
                            onChange={(e) => setNewPhone(e.target.value)}
                            placeholder="0555 111 22 33"
                            className="h-11"
                            inputMode="tel"
                            required
                          />
                        </div>
                        <p className="sm:col-span-2 text-[11px] text-muted-foreground">
                          Mağaza bilgileri ve silinme uyarıları e-postana gider;
                          iletişim bilgileri kötüye kullanımı önlemek içindir.
                        </p>
                      </div>
                      <div className="space-y-1">
                        <label className="block text-xs font-medium text-muted-foreground">
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
                          <label className="block text-xs font-medium text-muted-foreground">
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
                          <label className="block text-xs font-medium text-muted-foreground">
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
                      {verifyToken !== null && (
                        <div className="space-y-1 rounded-lg border border-primary/30 bg-primary/5 p-3">
                          <label className="block text-xs font-medium text-muted-foreground">
                            E-postana gelen 6 haneli doğrulama kodu
                          </label>
                          <Input
                            value={verifyCode}
                            onChange={(e) =>
                              setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                            }
                            placeholder="123456"
                            className="h-11 font-mono tracking-[0.3em] text-center"
                            inputMode="numeric"
                            autoFocus
                            required
                          />
                          <button
                            type="button"
                            className="text-[11px] text-primary underline underline-offset-2"
                            onClick={() => {
                              setVerifyToken(null)
                              setVerifyCode("")
                            }}
                          >
                            Kod gelmedi mi? Bilgileri düzeltip tekrar gönder
                          </button>
                        </div>
                      )}
                      <Button type="submit" className="w-full h-11" disabled={busy}>
                        <Store className="h-4 w-4 mr-1" />
                        {busy
                          ? "Oluşturuluyor..."
                          : verifyToken !== null
                            ? "Kodu Doğrula ve Mağazayı Oluştur"
                            : "Mağazayı Oluştur"}
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            <p className="text-center text-xs text-muted-foreground mt-4">
              Tek kişilik yerel sayım için{" "}
              <Link href="/sayim" className="text-primary underline underline-offset-2">
                normal sayıma geç
              </Link>
            </p>
          </>
        )}
        <PoweredByStokzen />
      </div>
    </div>
  )
}
