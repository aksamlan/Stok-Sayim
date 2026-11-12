"use client"

import { ChevronDown, History } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { apiActivity, type ActivityEntry } from "@/lib/store-client/api"
import { fmtShort } from "@/lib/time"

function describe(e: ActivityEntry): { text: string; tone: "add" | "remove" | "info" } {
  switch (e.action) {
    case "scan": {
      const q = e.qty ?? 0
      const who = e.name ?? "Listede yok"
      return q >= 0
        ? { text: `+${q} · ${who} (${e.barcode})`, tone: "add" }
        : { text: `−${Math.abs(q)} çıkardı/sildi · ${who} (${e.barcode})`, tone: "remove" }
    }
    case "login":
      return { text: "giriş yaptı", tone: "info" }
    case "session_start":
      return { text: `sayımı başlattı${e.detail ? `: ${e.detail}` : ""}`, tone: "info" }
    case "session_close":
      return { text: "sayımı bitirdi", tone: "info" }
    case "catalog_upload":
      return { text: `ürün listesi yükledi${e.detail ? ` (${e.detail})` : ""}`, tone: "info" }
    case "reset_counts":
      return { text: `sayımları temizledi${e.detail ? ` (${e.detail})` : ""}`, tone: "remove" }
    case "reset_all":
      return { text: `mağazayı komple sıfırladı${e.detail ? ` (${e.detail})` : ""}`, tone: "remove" }
    case "counter_reset":
      return { text: `PIN sıfırladı${e.detail ? `: ${e.detail}` : ""}`, tone: "info" }
    default:
      return { text: e.action, tone: "info" }
  }
}

// Hareket listesi (sabit kişi/sayım için). Etkinken 8 sn'de bir yenilenir; hepsi
// indeksli sorgudur (yavaşlatmaz).
export function ActivityFeed({
  token,
  sessionId,
  actor,
  active,
  onError,
  max = 500,
}: {
  token: string
  sessionId?: string
  actor?: string
  active: boolean
  onError: (err: unknown) => void
  max?: number
}) {
  const [entries, setEntries] = useState<ActivityEntry[]>([])
  const [limit, setLimit] = useState(50)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await apiActivity(token, { sessionId, actor: actor || undefined, limit })
      setEntries(r.entries)
    } catch (err) {
      onError(err)
    } finally {
      setLoading(false)
    }
  }, [token, sessionId, actor, limit, onError])

  useEffect(() => {
    setLimit(50)
  }, [actor])

  useEffect(() => {
    if (!active) return
    setLoading(true)
    void load()
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void load()
    }, 8000)
    return () => clearInterval(t)
  }, [active, load])

  return (
    <>
      <p className="px-3 pb-1 text-xs text-muted-foreground">
        {loading ? "yükleniyor..." : `son ${entries.length} hareket (KKTC saati)`}
      </p>
      <ul className="max-h-[50vh] divide-y overflow-auto border-t">
        {entries.length === 0 && !loading && (
          <li className="px-3 py-4 text-center text-sm text-muted-foreground">Henüz hareket yok</li>
        )}
        {entries.map((e, i) => {
          const d = describe(e)
          return (
            <li key={`${e.at}-${i}`} className="flex items-baseline gap-2 px-3 py-1.5 text-sm">
              <span className="w-[8.5rem] shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                {fmtShort(e.at)}
              </span>
              <span className="min-w-0">
                {!actor && <b className="font-semibold">{e.actor} </b>}
                <span
                  className={
                    d.tone === "add"
                      ? "text-foreground"
                      : d.tone === "remove"
                        ? "text-destructive"
                        : "text-muted-foreground"
                  }
                >
                  {d.text}
                </span>
              </span>
            </li>
          )
        })}
      </ul>
      {entries.length >= limit && limit < max && (
        <div className="border-t p-2 text-center">
          <Button variant="ghost" size="sm" onClick={() => setLimit((l) => Math.min(max, l + 50))}>
            Daha fazla göster
          </Button>
        </div>
      )}
    </>
  )
}

// "Kim en son ne yaptı": tüm hareketler, kişiye göre süzülebilir; en yeni üstte.
export function ActivityLog({
  token,
  sessionId,
  people,
  onError,
}: {
  token: string
  sessionId?: string
  people: string[]
  onError: (err: unknown) => void
}) {
  const [open, setOpen] = useState(false)
  const [actor, setActor] = useState("")
  return (
    <Card className="mb-3 py-0 gap-0 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
        aria-expanded={open}
      >
        <History className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Hareket geçmişi</span>
        <span className="text-xs text-muted-foreground">kim ne zaman ne yaptı</span>
        <ChevronDown className={`ml-auto h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="border-t">
          <div className="px-3 py-2">
            <select
              value={actor}
              onChange={(e) => setActor(e.target.value)}
              className="h-8 rounded-md border bg-card px-2 text-sm"
              aria-label="Kişiye göre filtrele"
            >
              <option value="">Herkes</option>
              <option value="Yönetici">Yönetici</option>
              {people.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <ActivityFeed
            token={token}
            sessionId={sessionId}
            actor={actor || undefined}
            active={open}
            onError={onError}
          />
        </div>
      )}
    </Card>
  )
}
