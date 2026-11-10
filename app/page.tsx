"use client"

import Link from "next/link"
import { Moon, Sun, ScanBarcode, Store, ArrowRight, WifiOff, Users, FileSpreadsheet, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { StokzenWordmark, PoweredByStokzen } from "@/components/stokzen"
import { useDarkMode } from "@/lib/store-client/use-dark-mode"

const modes = [
  {
    href: "/sayim",
    title: "Normal Sayım",
    desc: "Tek başına, hesapsız. Veriler yalnız bu cihazda tutulur.",
    icon: ScanBarcode,
    cta: "Sayıma başla",
    points: [
      { icon: Zap, text: "Kurulum yok, hemen başla" },
      { icon: WifiOff, text: "İnternetsiz çalışır" },
      { icon: FileSpreadsheet, text: "Excel / CSV çıktısı" },
    ],
    tone: "bg-primary",
  },
  {
    href: "/magaza",
    title: "Mağaza Sayımı",
    desc: "Mağaza kodu ve şifreyle ekip halinde aynı anda sayım yapın.",
    icon: Store,
    cta: "Mağazaya gir",
    points: [
      { icon: Users, text: "10+ kişi eş zamanlı" },
      { icon: FileSpreadsheet, text: "Ürün kataloğu ve karşılaştırma" },
      { icon: Zap, text: "Canlı yönetici panosu" },
    ],
    tone: "bg-[oklch(0.33_0.08_258)] dark:bg-[oklch(0.38_0.07_258)]",
  },
]

export default function Home() {
  const [dark, toggleDark] = useDarkMode()
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-3 sm:p-5 max-w-3xl">
        <div className="flex items-center justify-between mb-6 sm:mb-10">
          <h1 className="text-lg sm:text-xl">
            <StokzenWordmark className="text-lg sm:text-xl" />
          </h1>
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

        <div className="mb-5 sm:mb-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/marka/logo"
            alt="Stokzen"
            className="mx-auto mb-3 h-24 sm:h-32 w-auto object-contain"
          />
          <h2 className="text-xl sm:text-2xl font-bold">Stok Sayım</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Barkod okutarak sayım yapın. Nasıl devam etmek istersiniz?
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
          {modes.map((m) => (
            <Link
              key={m.href}
              href={m.href}
              className="group relative overflow-hidden rounded-lg border bg-card transition-colors hover:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 outline-none"
            >
              <div className={`flex items-center gap-3 ${m.tone} p-4 text-white`}>
                <span className="flex h-11 w-11 items-center justify-center rounded-md bg-white/15">
                  <m.icon className="h-6 w-6" />
                </span>
                <div>
                  <div className="text-lg font-bold leading-tight">{m.title}</div>
                </div>
              </div>
              <div className="space-y-3 p-4">
                <p className="text-[13px] text-muted-foreground">{m.desc}</p>
                <ul className="space-y-1.5">
                  {m.points.map((p) => (
                    <li key={p.text} className="flex items-center gap-2 text-[13px] font-medium">
                      <p.icon className="h-3.5 w-3.5 shrink-0 text-primary" />
                      {p.text}
                    </li>
                  ))}
                </ul>
                <div className="flex items-center justify-between rounded-md bg-primary/10 px-3 py-2 text-sm font-semibold text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  {m.cta}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </div>
              </div>
            </Link>
          ))}
        </div>

        <PoweredByStokzen />
      </div>
    </div>
  )
}
