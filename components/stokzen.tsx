import { cn } from "@/lib/utils"

export function StokzenLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn("h-4 w-4", className)}
    >
      <rect x="1" y="1" width="22" height="22" rx="5" className="fill-primary" />
      <g className="fill-primary-foreground">
        <rect x="5.5" y="6" width="1.6" height="12" rx="0.8" />
        <rect x="8.7" y="6" width="2.6" height="12" rx="1" />
        <rect x="13" y="6" width="1.6" height="12" rx="0.8" />
        <rect x="16.2" y="6" width="2.6" height="12" rx="1" />
      </g>
    </svg>
  )
}

export function StokzenWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 font-bold tracking-tight", className)}>
      <StokzenLogo className="h-5 w-5" />
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
        <StokzenLogo className="h-3.5 w-3.5 opacity-80" />
        <span>
          Powered by <span className="font-semibold">Stokzen</span>
        </span>
      </a>
    </footer>
  )
}
