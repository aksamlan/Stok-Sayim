import { cn } from "@/lib/utils"

// Marka görselleri /marka/* üzerinden gelir: varsayılan Stokzen logosu,
// /yonetim panelinden değiştirilebilir. Tarayıcı ETag ile doğrular.
export function StokzenLogo({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/marka/icon"
      alt=""
      aria-hidden="true"
      draggable={false}
      className={cn("h-4 w-4 object-contain", className)}
    />
  )
}

export function StokzenWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 font-bold tracking-tight", className)}>
      <StokzenLogo className="h-7 w-7" />
      <span>
        Stok<span className="text-primary">zen</span>
      </span>
    </span>
  )
}

export function PoweredByStokzen() {
  return (
    <footer className="mt-8 pb-6 flex justify-center">
      <a
        href="https://stokzen.com"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <StokzenLogo className="h-4 w-4" />
        <span>
          Powered by <span className="font-semibold">Stokzen</span>
        </span>
      </a>
    </footer>
  )
}
