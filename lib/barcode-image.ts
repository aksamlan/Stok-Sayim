// Fotoğraftan barkod çözme. Önce tarayıcının yerli BarcodeDetector API'si
// denenir (telefonlarda çok daha isabetli), bulunamazsa html5-qrcode ile
// farklı boyut, kontrast ve döndürme varyantları üzerinde tekrar denenir.
// Hiçbir koşulda hata fırlatmaz: sonuç ya barkod metni ya da null'dur.

const DETECTOR_FORMATS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "code_93",
  "itf",
  "codabar",
  "qr_code",
  "data_matrix",
]

interface DetectedBarcode {
  rawValue: string
}

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>
}

interface BarcodeDetectorCtor {
  new (options?: { formats: string[] }): BarcodeDetectorLike
  getSupportedFormats(): Promise<string[]>
}

const loadImage = (file: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("Görüntü açılamadı"))
    }
    img.src = url
  })

// Görüntüyü hedef genişliğe ölçekleyerek canvas'a çizer
const toCanvas = (img: HTMLImageElement, maxWidth: number): HTMLCanvasElement => {
  const scale = Math.min(1, maxWidth / img.naturalWidth)
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
  const ctx = canvas.getContext("2d")!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas
}

// Gri tonlama + kontrast germe: loş/soluk fotoğraflarda okumayı kolaylaştırır
const enhanceContrast = (source: HTMLCanvasElement): HTMLCanvasElement => {
  const canvas = document.createElement("canvas")
  canvas.width = source.width
  canvas.height = source.height
  const ctx = canvas.getContext("2d")!
  ctx.drawImage(source, 0, 0)
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d = imageData.data
  let min = 255
  let max = 0
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    if (lum < min) min = lum
    if (lum > max) max = lum
  }
  const range = Math.max(1, max - min)
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    const v = Math.max(0, Math.min(255, ((lum - min) / range) * 255))
    d[i] = d[i + 1] = d[i + 2] = v
  }
  ctx.putImageData(imageData, 0, 0)
  return canvas
}

const rotate90 = (source: HTMLCanvasElement): HTMLCanvasElement => {
  const canvas = document.createElement("canvas")
  canvas.width = source.height
  canvas.height = source.width
  const ctx = canvas.getContext("2d")!
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate(Math.PI / 2)
  ctx.drawImage(source, -source.width / 2, -source.height / 2)
  return canvas
}

const canvasToFile = (canvas: HTMLCanvasElement): Promise<File | null> =>
  new Promise(resolve => {
    canvas.toBlob(
      blob =>
        resolve(blob ? new File([blob], "scan.png", { type: "image/png" }) : null),
      "image/png"
    )
  })

// Denenecek görüntü varyantları: hızlıdan yavaşa doğru sıralı
const buildVariants = (img: HTMLImageElement): HTMLCanvasElement[] => {
  const base1600 = toCanvas(img, 1600)
  const variants: HTMLCanvasElement[] = [base1600, toCanvas(img, 1000)]
  if (img.naturalWidth > 1700) variants.push(toCanvas(img, 2400))
  variants.push(enhanceContrast(base1600))
  variants.push(rotate90(base1600))
  return variants
}

const tryNativeDetector = async (
  variants: HTMLCanvasElement[]
): Promise<string | null> => {
  const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
    .BarcodeDetector
  if (!Detector) return null
  try {
    const supported = await Detector.getSupportedFormats()
    const formats = DETECTOR_FORMATS.filter(f => supported.includes(f))
    if (formats.length === 0) return null
    const detector = new Detector({ formats })
    for (const canvas of variants) {
      const found = await detector.detect(canvas)
      const value = found.find(b => b.rawValue?.trim())?.rawValue?.trim()
      if (value) return value
    }
  } catch {
    // yerli dekoder başarısız — zxing'e düş
  }
  return null
}

const tryHtml5Qrcode = async (
  variants: HTMLCanvasElement[]
): Promise<string | null> => {
  const holder = document.createElement("div")
  holder.id = `photo-scan-${Date.now()}`
  holder.style.display = "none"
  document.body.appendChild(holder)
  try {
    const { Html5Qrcode } = await import("html5-qrcode")
    const scanner = new Html5Qrcode(holder.id, false)
    try {
      for (const canvas of variants) {
        const file = await canvasToFile(canvas)
        if (!file) continue
        try {
          const result = await scanner.scanFileV2(file, false)
          const value = result?.decodedText?.trim()
          if (value) return value
        } catch {
          // bu varyantta bulunamadı — sıradakini dene
        }
      }
    } finally {
      try {
        scanner.clear()
      } catch {
        // temizleme hatası önemsiz
      }
    }
  } catch {
    // kütüphane yüklenemedi
  } finally {
    holder.remove()
  }
  return null
}

export const decodeBarcodeFromImage = async (
  file: File
): Promise<string | null> => {
  let img: HTMLImageElement | null = null
  try {
    img = await loadImage(file)
    const variants = buildVariants(img)
    const native = await tryNativeDetector(variants)
    if (native) return native
    return await tryHtml5Qrcode(variants)
  } catch {
    return null
  } finally {
    if (img?.src.startsWith("blob:")) URL.revokeObjectURL(img.src)
  }
}
