"use client"

import { Camera, Zap } from "lucide-react"
import { useEffect, useRef } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

// html5-qrcode tiplerini dinamik import ile kullanıyoruz (SSR uyumu)
type Html5QrcodeType = any

export function CameraScanner({
  open,
  onClose,
  onDetected,
  continuous = false,
  continuousHint,
  onCloseAutoFocus,
}: {
  open: boolean
  onClose: () => void
  onDetected: (code: string) => void
  continuous?: boolean
  continuousHint?: string
  onCloseAutoFocus?: () => void
}) {
  const scannerRef = useRef<HTMLDivElement>(null)
  const lastScanRef = useRef<{ code: string; time: number }>({ code: "", time: 0 })
  const onDetectedRef = useRef(onDetected)
  const onCloseRef = useRef(onClose)
  const continuousRef = useRef(continuous)
  onDetectedRef.current = onDetected
  onCloseRef.current = onClose
  continuousRef.current = continuous

  useEffect(() => {
    if (!open) return

    let cancelled = false
    let scannerInstance: Html5QrcodeType = null

    const initScanner = async () => {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode")

      if (cancelled || !scannerRef.current) return

      const scannerId = "magaza-barcode-scanner-view"
      let scannerEl = document.getElementById(scannerId)
      if (!scannerEl) {
        scannerEl = document.createElement("div")
        scannerEl.id = scannerId
        scannerRef.current.appendChild(scannerEl)
      }

      const html5QrCode = new Html5Qrcode(scannerId, {
        verbose: false,
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.CODE_93,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.CODABAR,
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.DATA_MATRIX,
        ],
      })
      scannerInstance = html5QrCode

      try {
        await html5QrCode.start(
          { facingMode: "environment" },
          {
            fps: 15,
            qrbox: (viewfinderWidth: number, viewfinderHeight: number) => ({
              width: Math.floor(viewfinderWidth * 0.85),
              height: Math.floor(viewfinderHeight * 0.5),
            }),
            videoConstraints: {
              facingMode: "environment",
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
          },
          (decodedText: string) => {
            const code = decodedText.trim()
            const now = Date.now()
            const last = lastScanRef.current

            if (continuousRef.current) {
              if (code === last.code && now - last.time < 2000) return
              if (now - last.time < 600) return
              lastScanRef.current = { code, time: now }
              onDetectedRef.current(code)
            } else {
              // stop/clear is handled by the effect cleanup; calling stop here
              // as well crashes on phones (clear while stopping).
              lastScanRef.current = { code, time: now }
              onCloseRef.current()
              onDetectedRef.current(code)
            }
          },
          () => {
            // Scan error - ignore, keep scanning
          }
        )
      } catch (err) {
        console.error("Camera error:", err)
      }
    }

    initScanner()

    return () => {
      cancelled = true
      if (scannerInstance) {
        const instance = scannerInstance
        const clearSafely = () => {
          try {
            instance.clear()
          } catch {
            // ignore
          }
        }
        // clear() must wait for stop(); stop() throws synchronously if the
        // camera never started.
        try {
          instance.stop().catch(() => {}).finally(clearSafely)
        } catch {
          clearSafely()
        }
      }
    }
  }, [open])

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          onCloseAutoFocus?.()
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Kamera ile Barkod Okut
          </DialogTitle>
        </DialogHeader>
        <div className="relative">
          <div ref={scannerRef} className="w-full min-h-[300px] rounded-lg overflow-hidden" />
          <p className="text-sm text-muted-foreground text-center mt-3">
            Barkodu kamera alanına getirin
          </p>
          {continuous && continuousHint && (
            <p className="text-xs text-center mt-1 text-primary font-medium">
              <Zap className="h-3 w-3 inline mr-1" />
              {continuousHint}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
