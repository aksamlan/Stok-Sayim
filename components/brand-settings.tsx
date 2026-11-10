"use client"

import { ImageUp, RotateCcw } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type Kind = "logo" | "icon"
type Status = { logoCustom: boolean; iconCustom: boolean; updatedAt: number }

const SLOTS: { kind: Kind; title: string; hint: string; max: number; box: string }[] = [
  {
    kind: "logo",
    title: "Logo",
    hint: "Ana sayfada görünür. Şeffaf PNG önerilir.",
    max: 700,
    box: "h-24 w-32",
  },
  {
    kind: "icon",
    title: "Simge (favicon)",
    hint: "Tarayıcı sekmesi, telefon ana ekranı ve üst bar. Kare olmalı.",
    max: 512,
    box: "h-24 w-24",
  },
]

// Büyük görselleri istemcide küçültür (yükleme limiti 1,5 MB); şeffaflık korunur.
async function toDataUrl(file: File, max: number): Promise<string> {
  const src = await new Promise<string>((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(String(r.result))
    r.onerror = () => rej(new Error("Dosya okunamadı"))
    r.readAsDataURL(file)
  })
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image()
    i.onload = () => res(i)
    i.onerror = () => rej(new Error("Görsel açılamadı (PNG, JPG veya WEBP olmalı)"))
    i.src = src
  })
  const scale = Math.min(1, max / Math.max(img.width, img.height))
  if (scale === 1 && file.size < 1_000_000) return src
  const c = document.createElement("canvas")
  c.width = Math.round(img.width * scale)
  c.height = Math.round(img.height * scale)
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height)
  return c.toDataURL("image/png")
}

export function BrandSettings({ token }: { token: string }) {
  const [status, setStatus] = useState<Status | null>(null)
  const [busy, setBusy] = useState<Kind | null>(null)
  const inputs = useRef<Partial<Record<Kind, HTMLInputElement | null>>>({})

  const call = useCallback(
    async (method: string, path = "/api/yonetim/brand", body?: unknown) => {
      const res = await fetch(path, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? "İşlem başarısız")
      return data as Status
    },
    [token]
  )

  useEffect(() => {
    call("GET").then(setStatus).catch(() => {})
  }, [call])

  async function upload(kind: Kind, max: number, file: File) {
    setBusy(kind)
    try {
      const dataUrl = await toDataUrl(file, max)
      setStatus(await call("PUT", "/api/yonetim/brand", { kind, dataUrl }))
      toast.success("Görsel güncellendi")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Yüklenemedi")
    } finally {
      setBusy(null)
    }
  }

  async function reset(kind: Kind) {
    setBusy(kind)
    try {
      setStatus(await call("DELETE", `/api/yonetim/brand?kind=${kind}`))
      toast.success("Varsayılana dönüldü")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sıfırlanamadı")
    } finally {
      setBusy(null)
    }
  }

  const v = status?.updatedAt ?? 0
  return (
    <Card className="mb-3">
      <CardHeader>
        <CardTitle className="text-base">Marka görselleri</CardTitle>
        <CardDescription>
          Logo ve favicon tüm sitede kullanılır. Değişiklik anında yansır (sekme simgesi için
          sayfayı yenile).
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        {SLOTS.map((s) => {
          const custom = status ? (s.kind === "logo" ? status.logoCustom : status.iconCustom) : false
          return (
            <div key={s.kind} className="flex items-center gap-3 rounded-lg border p-3">
              <div
                className={`${s.box} shrink-0 rounded-md border bg-[conic-gradient(#e5e7eb_25%,#fff_0_50%,#e5e7eb_0_75%,#fff_0)] bg-[length:12px_12px] p-1`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/marka/${s.kind}?v=${v}`}
                  alt={s.title}
                  className="h-full w-full object-contain"
                />
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="text-sm font-semibold leading-tight">
                  {s.title}
                  {custom && <span className="ml-1.5 text-xs font-medium text-primary">özel</span>}
                </p>
                <p className="text-xs text-muted-foreground">{s.hint}</p>
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    className="h-8"
                    disabled={busy !== null}
                    onClick={() => inputs.current[s.kind]?.click()}
                  >
                    <ImageUp className="h-3.5 w-3.5" />
                    Yükle
                  </Button>
                  {custom && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8"
                      disabled={busy !== null}
                      onClick={() => reset(s.kind)}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Varsayılan
                    </Button>
                  )}
                </div>
                <input
                  ref={(el) => {
                    inputs.current[s.kind] = el
                  }}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    e.target.value = ""
                    if (f) upload(s.kind, s.max, f)
                  }}
                />
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
