"use client"

import { Pencil } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

// Mağaza adını değiştir. onSubmit hata fırlatırsa pencere açık kalır ve mesaj gösterilir.
export function RenameStoreDialog({
  open,
  currentName,
  onClose,
  onSubmit,
}: {
  open: boolean
  currentName: string
  onClose: () => void
  onSubmit: (name: string) => Promise<void>
}) {
  const [name, setName] = useState(currentName)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (open) {
      setName(currentName)
      setError("")
    }
  }, [open, currentName])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const n = name.trim()
    if (!n || busy) return
    if (n === currentName) return onClose()
    setBusy(true)
    setError("")
    try {
      await onSubmit(n)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Değiştirilemedi")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5 text-primary" />
            Mağaza adını değiştir
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            className="h-11"
            autoFocus
            required
            aria-label="Mağaza adı"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <p className="text-xs text-muted-foreground">
            Mağaza kodu, şifreler ve sayımlar değişmez. Cihazlar yeni adı kendiliğinden alır.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Vazgeç
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? "Kaydediliyor..." : "Kaydet"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
