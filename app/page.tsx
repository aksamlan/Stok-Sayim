"use client"

import React, { Suspense, useState, useEffect, useRef, useCallback } from "react"
import Link from "next/link"
import { Plus, Minus, Trash2, Download, Upload, Moon, Sun, Search, Volume2, VolumeX, RotateCcw, Camera, ScanBarcode, Package, AlertTriangle, CheckCircle2, XCircle, Zap, ClipboardList, Pencil, PlusCircle, Delete, ImageUp, Share2, FileSpreadsheet, FileText, Printer, ChevronDown, Store } from "lucide-react"
import { Toaster, toast } from "sonner"
import { PoweredByStokzen } from "@/components/stokzen"
import { loadAuth } from "@/lib/store-client/session"
import type { StoreAuth } from "@/lib/store-client/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  downloadCountCSV,
  downloadCountXLSX,
  downloadCompareCSV,
  downloadCompareXLSX,
  printCountPDF,
  printComparePDF,
  shareCount,
  shareCompare,
  type ShareOutcome,
} from "@/lib/export"
import { decodeBarcodeFromImage } from "@/lib/barcode-image"

interface InventoryItem {
  barcode: string
  quantity: number
}

interface CountSession {
  id: string
  name: string
  createdAt: number
}

const genSessionId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

interface ComparisonResult {
  barcode: string
  stockQty: number
  countQty: number
  status: "match" | "difference" | "only-stock" | "only-count"
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Html5QrcodeType = any

function InventoryCounterContent() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [stockItems, setStockItems] = useState<InventoryItem[]>([])
  const [sessions, setSessions] = useState<CountSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [renameValue, setRenameValue] = useState("")
  const [barcodeInput, setBarcodeInput] = useState("")
  const [quickMode, setQuickMode] = useState(false)
  const [quickQty, setQuickQty] = useState(1)
  const [searchQuery, setSearchQuery] = useState("")
  const [darkMode, setDarkMode] = useState(false)
  const [magazaAuth, setMagazaAuth] = useState<StoreAuth | null>(null)
  useEffect(() => {
    setMagazaAuth(loadAuth())
  }, [])
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [lastScanned, setLastScanned] = useState<string | null>(null)
  const [lastScannedPersistent, setLastScannedPersistent] = useState<string | null>(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<"count" | "compare">("count")
  const [deleteConfirmBarcode, setDeleteConfirmBarcode] = useState<string | null>(null)
  const [decrementConfirmBarcode, setDecrementConfirmBarcode] = useState<string | null>(null)
  const [qtyDialogOpen, setQtyDialogOpen] = useState(false)
  const [pendingBarcode, setPendingBarcode] = useState<string | null>(null)
  const [dialogQty, setDialogQty] = useState("1")
  const [photoBusy, setPhotoBusy] = useState(false)

  const barcodeInputRef = useRef<HTMLInputElement>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const stockFileInputRef = useRef<HTMLInputElement>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const scannerRef = useRef<HTMLDivElement>(null)
  const html5QrScannerRef = useRef<Html5QrcodeType>(null)
  const addBarcodeRef = useRef<((barcode: string, qty: number) => void) | null>(null)
  const itemsRef = useRef<InventoryItem[]>([])
  const quickModeRef = useRef(false)
  const quickQtyRef = useRef(1)
  const lastCamScanRef = useRef<{ code: string; time: number }>({ code: "", time: 0 })
  const dialogPristineRef = useRef(true)
  const openQtyDialogRef = useRef<((barcode: string) => void) | null>(null)

  // Load from localStorage on mount
  useEffect(() => {
    // Sessions: migrate legacy single-list data into the first session
    let loadedSessions: CountSession[] = []
    try {
      loadedSessions = JSON.parse(localStorage.getItem("inventorySessions") || "[]")
    } catch {
      loadedSessions = []
    }
    let activeId = localStorage.getItem("inventoryActiveSession")
    if (!Array.isArray(loadedSessions) || loadedSessions.length === 0) {
      const id = genSessionId()
      loadedSessions = [{ id, name: "Sayım 1", createdAt: Date.now() }]
      activeId = id
      const legacyItems = localStorage.getItem("inventoryItems")
      if (legacyItems) {
        localStorage.setItem(`inventoryItems_${id}`, legacyItems)
      }
      localStorage.setItem("inventorySessions", JSON.stringify(loadedSessions))
      localStorage.setItem("inventoryActiveSession", id)
    }
    if (!activeId || !loadedSessions.some(s => s.id === activeId)) {
      activeId = loadedSessions[0].id
    }
    setSessions(loadedSessions)
    setActiveSessionId(activeId)

    const savedItems = localStorage.getItem(`inventoryItems_${activeId}`)
    const savedStockItems = localStorage.getItem("inventoryStockItems")
    const savedDarkMode = localStorage.getItem("inventoryDarkMode")
    const savedSound = localStorage.getItem("inventorySoundEnabled")
    const savedLastScanned = localStorage.getItem("inventoryLastScanned")
    const savedQuickMode = localStorage.getItem("inventoryQuickMode")
    const savedQuickQty = localStorage.getItem("inventoryQuickQty")

    if (savedItems) {
      try {
        setItems(JSON.parse(savedItems))
      } catch {
        console.error("Failed to parse saved items")
      }
    }
    if (savedStockItems) {
      try {
        setStockItems(JSON.parse(savedStockItems))
      } catch {
        console.error("Failed to parse saved stock items")
      }
    }
    if (savedDarkMode) {
      setDarkMode(savedDarkMode === "true")
    }
    if (savedSound !== null) {
      setSoundEnabled(savedSound === "true")
    }
    if (savedLastScanned) {
      setLastScannedPersistent(savedLastScanned)
    }
    if (savedQuickMode) {
      setQuickMode(savedQuickMode === "true")
    }
    if (savedQuickQty) {
      const qty = parseInt(savedQuickQty)
      if (!isNaN(qty) && qty > 0) setQuickQty(qty)
    }
  }, [])

  // Keep refs in sync (used by camera callback and toast messages)
  useEffect(() => {
    itemsRef.current = items
  }, [items])

  useEffect(() => {
    quickModeRef.current = quickMode
    localStorage.setItem("inventoryQuickMode", String(quickMode))
  }, [quickMode])

  useEffect(() => {
    quickQtyRef.current = quickQty
    localStorage.setItem("inventoryQuickQty", String(quickQty))
  }, [quickQty])

  // Save to localStorage when items change (per active session)
  useEffect(() => {
    if (!activeSessionId) return
    localStorage.setItem(`inventoryItems_${activeSessionId}`, JSON.stringify(items))
  }, [items, activeSessionId])

  // Persist sessions list and active session
  useEffect(() => {
    if (sessions.length === 0) return
    localStorage.setItem("inventorySessions", JSON.stringify(sessions))
  }, [sessions])

  useEffect(() => {
    if (!activeSessionId) return
    localStorage.setItem("inventoryActiveSession", activeSessionId)
  }, [activeSessionId])

  // Save stock items to localStorage
  useEffect(() => {
    localStorage.setItem("inventoryStockItems", JSON.stringify(stockItems))
  }, [stockItems])

  // Save dark mode preference
  useEffect(() => {
    localStorage.setItem("inventoryDarkMode", String(darkMode))
    if (darkMode) {
      document.documentElement.classList.add("dark")
    } else {
      document.documentElement.classList.remove("dark")
    }
  }, [darkMode])

  // Save sound preference
  useEffect(() => {
    localStorage.setItem("inventorySoundEnabled", String(soundEnabled))
  }, [soundEnabled])

  // Focus barcode input on mount
  useEffect(() => {
    barcodeInputRef.current?.focus()
  }, [])

  // Play beep sound
  const playBeep = useCallback(() => {
    if (!soundEnabled) return
    
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      }
      
      const ctx = audioContextRef.current
      const oscillator = ctx.createOscillator()
      const gainNode = ctx.createGain()
      
      oscillator.connect(gainNode)
      gainNode.connect(ctx.destination)
      
      oscillator.frequency.value = 1000
      oscillator.type = "sine"
      
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1)
      
      oscillator.start(ctx.currentTime)
      oscillator.stop(ctx.currentTime + 0.1)
    } catch {
      // Audio not supported
    }
  }, [soundEnabled])

  // Undo a just-made addition (from toast action)
  const undoAdd = useCallback((barcode: string, qty: number) => {
    setItems(prevItems =>
      prevItems
        .map(item =>
          item.barcode === barcode
            ? { ...item, quantity: item.quantity - qty }
            : item
        )
        .filter(item => item.quantity > 0)
    )
    toast.info(`${barcode} geri alındı (-${qty})`)
  }, [])

  // Add barcode to list (shared logic)
  const addBarcodeToList = useCallback((barcode: string, qty: number) => {
    playBeep()
    setLastScanned(barcode)
    setLastScannedPersistent(barcode)
    localStorage.setItem("inventoryLastScanned", barcode)

    const prevQty = itemsRef.current.find(item => item.barcode === barcode)?.quantity ?? 0
    const newQty = prevQty + qty

    setItems(prevItems => {
      const existingIndex = prevItems.findIndex(item => item.barcode === barcode)

      if (existingIndex >= 0) {
        const newItems = [...prevItems]
        newItems[existingIndex] = {
          ...newItems[existingIndex],
          quantity: newItems[existingIndex].quantity + qty
        }
        return newItems
      } else {
        return [...prevItems, { barcode, quantity: qty }]
      }
    })

    // Sliding toast notification at the top (no page scroll)
    toast.success(barcode, {
      description: `+${qty} eklendi · Toplam: ${newQty}${prevQty === 0 ? " (yeni ürün)" : ""}`,
      duration: 2500,
      action: {
        label: "Geri Al",
        onClick: () => undoAdd(barcode, qty),
      },
    })

    // Clear row highlight after animation (persistent label stays)
    setTimeout(() => setLastScanned(null), 1500)
  }, [playBeep, undoAdd])

  // Keep ref in sync so camera callback can access latest
  useEffect(() => {
    addBarcodeRef.current = addBarcodeToList
  }, [addBarcodeToList])

  // Open the quantity popup for a scanned barcode (normal mode)
  const openQtyDialog = useCallback((barcode: string) => {
    playBeep()
    setPendingBarcode(barcode)
    setDialogQty("1")
    dialogPristineRef.current = true
    setQtyDialogOpen(true)
  }, [playBeep])

  useEffect(() => {
    openQtyDialogRef.current = openQtyDialog
  }, [openQtyDialog])

  // On-screen numpad handlers for the quantity popup
  const pressDialogDigit = (d: string) => {
    setDialogQty(prev => {
      if (dialogPristineRef.current) {
        dialogPristineRef.current = false
        return d
      }
      if (prev === "0" || prev === "") return d
      if (prev.length >= 5) return prev
      return prev + d
    })
  }

  const dialogBackspace = () => {
    dialogPristineRef.current = false
    setDialogQty(prev => prev.slice(0, -1))
  }

  const dialogClear = () => {
    dialogPristineRef.current = false
    setDialogQty("")
  }

  const closeQtyDialog = () => {
    setQtyDialogOpen(false)
    setPendingBarcode(null)
    barcodeInputRef.current?.focus()
  }

  const confirmQtyDialog = () => {
    if (!pendingBarcode) return
    const qty = Math.max(1, parseInt(dialogQty) || 1)
    addBarcodeToList(pendingBarcode, qty)
    closeQtyDialog()
  }

  // Camera scanner setup/teardown using dynamic import
  useEffect(() => {
    if (!cameraOpen) return

    let cancelled = false
    let scannerInstance: Html5QrcodeType = null

    const initScanner = async () => {
      // Dynamic import to avoid SSR issues
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode")

      if (cancelled || !scannerRef.current) return

      // Create a container div for the scanner
      const scannerId = "barcode-scanner-view"
      let scannerEl = document.getElementById(scannerId)
      if (!scannerEl) {
        scannerEl = document.createElement("div")
        scannerEl.id = scannerId
        scannerRef.current.appendChild(scannerEl)
      }

      const html5QrCode = new Html5Qrcode(scannerId, {
        verbose: false,
        // Telefonlarda çok daha isabetli olan yerleşik dekoderi kullan
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
      html5QrScannerRef.current = html5QrCode

      try {
        await html5QrCode.start(
          { facingMode: "environment" },
          {
            fps: 15,
            // Tarama alanını görüntüye göre geniş tut: uzaktan da yakalar
            qrbox: (viewfinderWidth: number, viewfinderHeight: number) => ({
              width: Math.floor(viewfinderWidth * 0.85),
              height: Math.floor(viewfinderHeight * 0.5),
            }),
            // Kamerayı yüksek çözünürlükte aç: küçük/uzak barkodlar da okunur
            videoConstraints: {
              facingMode: "environment",
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
          },
          (decodedText: string) => {
            const code = decodedText.trim()
            const now = Date.now()
            const last = lastCamScanRef.current

            if (quickModeRef.current) {
              // Quick mode: keep camera open, add with selected quantity.
              // Cooldown prevents the same frame being counted multiple times.
              if (code === last.code && now - last.time < 2000) return
              if (now - last.time < 600) return
              lastCamScanRef.current = { code, time: now }
              if (addBarcodeRef.current) {
                addBarcodeRef.current(code, quickQtyRef.current)
              }
            } else {
              // Normal mode: close camera and ask for the quantity in the popup.
              // stop/clear is handled by the effect cleanup; calling stop here
              // as well caused a crash on phones (clear while stopping).
              lastCamScanRef.current = { code, time: now }
              setCameraOpen(false)
              if (openQtyDialogRef.current) {
                openQtyDialogRef.current(code)
              }
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
        // clear() must wait for stop() to finish, otherwise html5-qrcode
        // throws "cannot clear while scan is ongoing" and crashes the page.
        // stop() itself throws synchronously if the camera never started.
        try {
          instance.stop().catch(() => {}).finally(clearSafely)
        } catch {
          clearSafely()
        }
        if (html5QrScannerRef.current === instance) {
          html5QrScannerRef.current = null
        }
      }
    }
  }, [cameraOpen])

  // Handle barcode scan from input
  const handleBarcodeScan = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    
    const barcode = barcodeInput.trim()
    if (!barcode) return

    if (quickMode) {
      // Quick mode: add instantly with the preset quantity
      addBarcodeToList(barcode, quickQty)
    } else {
      // Normal mode: ask for the quantity with the on-screen numpad popup
      openQtyDialog(barcode)
    }

    setBarcodeInput("")
    barcodeInputRef.current?.focus()
  }, [barcodeInput, quickMode, quickQty, addBarcodeToList, openQtyDialog])

  // Scan a barcode from a photo (gallery or phone camera shot).
  // Never throws: shows a toast when nothing readable is found.
  const handlePhotoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return

    setPhotoBusy(true)
    const toastId = toast.loading("Fotoğraf taranıyor...")
    try {
      const code = await decodeBarcodeFromImage(file)
      toast.dismiss(toastId)
      if (code) {
        if (quickModeRef.current) {
          addBarcodeToList(code, quickQtyRef.current)
        } else {
          openQtyDialog(code)
        }
      } else {
        toast.error("Fotoğrafta barkod bulunamadı", {
          description:
            "Barkodu daha yakından, net ve düz (paralel) çekip tekrar deneyin.",
        })
      }
    } catch {
      toast.dismiss(toastId)
      toast.error("Fotoğraf okunamadı", {
        description: "Dosya açılamadı veya desteklenmiyor.",
      })
    } finally {
      setPhotoBusy(false)
    }
  }

  // Close camera and cleanup
  const closeCamera = useCallback(async () => {
    if (html5QrScannerRef.current) {
      try {
        await html5QrScannerRef.current.stop()
      } catch {
        // ignore
      }
      try {
        html5QrScannerRef.current.clear()
      } catch {
        // ignore
      }
      html5QrScannerRef.current = null
    }
    setCameraOpen(false)
    barcodeInputRef.current?.focus()
  }, [])

  // Increment quantity
  const incrementQuantity = (barcode: string) => {
    setItems(prevItems =>
      prevItems.map(item =>
        item.barcode === barcode
          ? { ...item, quantity: item.quantity + 1 }
          : item
      )
    )
  }

  // Decrement quantity (with confirmation)
  const confirmDecrement = (barcode: string) => {
    setItems(prevItems =>
      prevItems.map(item =>
        item.barcode === barcode && item.quantity > 1
          ? { ...item, quantity: item.quantity - 1 }
          : item
      )
    )
    setDecrementConfirmBarcode(null)
  }

  // Delete item (with confirmation)
  const confirmDelete = (barcode: string) => {
    setItems(prevItems => prevItems.filter(item => item.barcode !== barcode))
    setDeleteConfirmBarcode(null)
  }

  // Load a session's items from storage
  const loadSessionItems = (id: string): InventoryItem[] => {
    try {
      const raw = localStorage.getItem(`inventoryItems_${id}`)
      const parsed = raw ? JSON.parse(raw) : []
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  // Switch to another count session (current one is already saved)
  const switchSession = (id: string) => {
    if (id === activeSessionId) return
    const target = sessions.find(s => s.id === id)
    if (!target) return
    setActiveSessionId(id)
    setItems(loadSessionItems(id))
    setLastScanned(null)
    setSearchQuery("")
    toast.info(`"${target.name}" sayımına geçildi — kaldığınız yerden devam edebilirsiniz`)
    barcodeInputRef.current?.focus()
  }

  // Freeze current count and start a new one
  const newSession = () => {
    const current = sessions.find(s => s.id === activeSessionId)
    const id = genSessionId()
    const name = `Sayım ${sessions.length + 1}`
    const session: CountSession = { id, name, createdAt: Date.now() }
    localStorage.setItem(`inventoryItems_${id}`, "[]")
    setSessions(prev => [...prev, session])
    setActiveSessionId(id)
    setItems([])
    setLastScanned(null)
    setSearchQuery("")
    toast.success(`Yeni sayım başlatıldı: ${name}`, {
      description: current ? `"${current.name}" donduruldu, dilediğinizde geri dönebilirsiniz` : undefined,
    })
    barcodeInputRef.current?.focus()
  }

  // Rename active session
  const renameSession = () => {
    const name = renameValue.trim()
    if (!name || !activeSessionId) return
    setSessions(prev => prev.map(s => (s.id === activeSessionId ? { ...s, name } : s)))
    setRenameDialogOpen(false)
    toast.success(`Sayım adı güncellendi: ${name}`)
  }

  // Delete active session (and its stored items)
  const deleteActiveSession = () => {
    if (!activeSessionId) return
    const remaining = sessions.filter(s => s.id !== activeSessionId)
    localStorage.removeItem(`inventoryItems_${activeSessionId}`)

    if (remaining.length === 0) {
      const id = genSessionId()
      const session: CountSession = { id, name: "Sayım 1", createdAt: Date.now() }
      localStorage.setItem(`inventoryItems_${id}`, "[]")
      setSessions([session])
      setActiveSessionId(id)
      setItems([])
    } else {
      setSessions(remaining)
      setActiveSessionId(remaining[0].id)
      setItems(loadSessionItems(remaining[0].id))
    }
    setLastScanned(null)
    setSearchQuery("")
    toast.info("Sayım silindi")
  }

  // Clear all items
  const clearAll = () => {
    setItems([])
    setLastScanned(null)
    setLastScannedPersistent(null)
    localStorage.removeItem("inventoryLastScanned")
    barcodeInputRef.current?.focus()
  }

  // Clear stock items
  const clearStock = () => {
    setStockItems([])
  }

  // Download sample CSV
  const downloadSampleCSV = () => {
    const sampleData = `Barkod;Adet
8690123456789;10
8690987654321;25
8691234567890;15
8695678901234;8
8699876543210;30`
    
    const blob = new Blob(["\ufeff" + sampleData], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = "ornek_stok.csv"
    link.click()
    URL.revokeObjectURL(url)
  }

  // --- Dışa aktarma ve paylaşma -------------------------------------------
  const activeSessionName =
    sessions.find(s => s.id === activeSessionId)?.name ?? "Sayım"

  const handleExportCountXLSX = async () => {
    try {
      await downloadCountXLSX(items, activeSessionName)
      toast.success("Excel (.xlsx) dosyası indirildi")
    } catch {
      toast.error("Excel dosyası oluşturulamadı")
    }
  }

  const handleExportCountCSV = () => {
    try {
      downloadCountCSV(items, activeSessionName)
      toast.success("CSV dosyası indirildi")
    } catch {
      toast.error("CSV dosyası oluşturulamadı")
    }
  }

  const handleExportCountPDF = () => {
    if (!printCountPDF(items, activeSessionName)) {
      toast.error("PDF penceresi açılamadı", {
        description: "Tarayıcınız açılır pencereyi engellemiş olabilir.",
      })
    }
  }

  const notifyShareOutcome = (outcome: ShareOutcome) => {
    switch (outcome) {
      case "file":
        toast.success("Sayım dosya olarak paylaşıldı")
        break
      case "text":
        toast.success("Sayım metin olarak paylaşıldı")
        break
      case "clipboard":
        toast.success("Paylaşım desteklenmiyor — liste panoya kopyalandı", {
          description: "İstediğiniz uygulamaya yapıştırabilirsiniz.",
        })
        break
      case "cancelled":
        break
      case "none":
        toast.error("Paylaşım yapılamadı")
        break
    }
  }

  const handleShareCount = async () => {
    notifyShareOutcome(await shareCount(items, activeSessionName))
  }

  const handleExportCompareXLSX = async () => {
    try {
      await downloadCompareXLSX(getComparisonResults(), activeSessionName)
      toast.success("Excel (.xlsx) dosyası indirildi")
    } catch {
      toast.error("Excel dosyası oluşturulamadı")
    }
  }

  const handleExportCompareCSV = () => {
    try {
      downloadCompareCSV(getComparisonResults(), activeSessionName)
      toast.success("CSV dosyası indirildi")
    } catch {
      toast.error("CSV dosyası oluşturulamadı")
    }
  }

  const handleExportComparePDF = () => {
    if (!printComparePDF(getComparisonResults(), activeSessionName)) {
      toast.error("PDF penceresi açılamadı", {
        description: "Tarayıcınız açılır pencereyi engellemiş olabilir.",
      })
    }
  }

  const handleShareCompare = async () => {
    notifyShareOutcome(await shareCompare(getComparisonResults(), activeSessionName))
  }

  // Parse CSV file helper
  const parseCSV = (text: string): InventoryItem[] => {
    const lines = text.split("\n").filter(line => line.trim())
    const startIndex = lines[0].toLowerCase().includes("barkod") || lines[0].toLowerCase().includes("barcode") ? 1 : 0
    
    const parsedItems: InventoryItem[] = []
    
    for (let i = startIndex; i < lines.length; i++) {
      const delimiter = lines[i].includes(";") ? ";" : ","
      const parts = lines[i].split(delimiter)
      if (parts.length >= 2) {
        const barcode = parts[0].trim()
        const quantity = parseInt(parts[1].trim())
        
        if (barcode && !isNaN(quantity) && quantity > 0) {
          const existingIndex = parsedItems.findIndex(item => item.barcode === barcode)
          if (existingIndex >= 0) {
            parsedItems[existingIndex].quantity += quantity
          } else {
            parsedItems.push({ barcode, quantity })
          }
        }
      }
    }
    
    return parsedItems
  }

  // Import count from CSV (merges with existing)
  const importFromCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      const importedItems = parseCSV(text)

      if (importedItems.length === 0) {
        toast.error("CSV dosyasında geçerli veri bulunamadı")
        return
      }
      toast.success(`${importedItems.length} ürün CSV'den içe aktarıldı`)

      setItems(prevItems => {
        const mergedItems = [...prevItems]
        
        for (const importedItem of importedItems) {
          const existingIndex = mergedItems.findIndex(item => item.barcode === importedItem.barcode)
          if (existingIndex >= 0) {
            mergedItems[existingIndex].quantity += importedItem.quantity
          } else {
            mergedItems.push(importedItem)
          }
        }
        
        return mergedItems
      })
    }
    
    reader.readAsText(file)
    e.target.value = ""
  }

  // Import stock from CSV (replaces existing stock)
  const importStockFromCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      const importedItems = parseCSV(text)
      if (importedItems.length === 0) {
        toast.error("CSV dosyasında geçerli veri bulunamadı")
        return
      }
      setStockItems(importedItems)
      toast.success(`Stok listesi yüklendi: ${importedItems.length} ürün`)
    }
    
    reader.readAsText(file)
    e.target.value = ""
  }

  // Get comparison results
  const getComparisonResults = useCallback((): ComparisonResult[] => {
    const results: ComparisonResult[] = []
    const allBarcodes = new Set([
      ...stockItems.map(i => i.barcode),
      ...items.map(i => i.barcode)
    ])
    
    for (const barcode of allBarcodes) {
      const stockItem = stockItems.find(i => i.barcode === barcode)
      const countItem = items.find(i => i.barcode === barcode)
      
      const stockQty = stockItem?.quantity || 0
      const countQty = countItem?.quantity || 0
      
      let status: ComparisonResult["status"]
      if (stockQty > 0 && countQty > 0) {
        status = stockQty === countQty ? "match" : "difference"
      } else if (stockQty > 0) {
        status = "only-stock"
      } else {
        status = "only-count"
      }
      
      results.push({ barcode, stockQty, countQty, status })
    }
    
    return results
  }, [stockItems, items])

  // Existing quantity of the barcode waiting in the popup
  const pendingExisting = pendingBarcode
    ? items.find(i => i.barcode === pendingBarcode)
    : undefined

  // Filter items based on search query
  const filteredItems = items.filter(item =>
    item.barcode.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Calculate total quantity
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0)
  const totalUniqueItems = items.length

  // Comparison stats
  const comparisonResults = getComparisonResults()
  const matchCount = comparisonResults.filter(r => r.status === "match").length
  const diffCount = comparisonResults.filter(r => r.status === "difference").length
  const onlyStockCount = comparisonResults.filter(r => r.status === "only-stock").length
  const onlyCountCount = comparisonResults.filter(r => r.status === "only-count").length

  // Filter comparison results
  const filteredComparison = comparisonResults.filter(item =>
    item.barcode.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const getStatusStyle = (status: ComparisonResult["status"]) => {
    switch (status) {
      case "match":
        return "bg-green-500/10 border-l-4 border-l-green-500"
      case "difference":
        return "bg-amber-500/10 border-l-4 border-l-amber-500"
      case "only-stock":
        return "bg-red-500/10 border-l-4 border-l-red-500"
      case "only-count":
        return "bg-blue-500/10 border-l-4 border-l-blue-500"
    }
  }

  const getStatusBadge = (status: ComparisonResult["status"]) => {
    switch (status) {
      case "match":
        return <Badge className="bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30 hover:bg-green-500/15"><CheckCircle2 className="h-3 w-3 mr-1" />Eşit</Badge>
      case "difference":
        return <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/15"><AlertTriangle className="h-3 w-3 mr-1" />Farklı</Badge>
      case "only-stock":
        return <Badge className="bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30 hover:bg-red-500/15"><XCircle className="h-3 w-3 mr-1" />Sayılmadı</Badge>
      case "only-count":
        return <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30 hover:bg-blue-500/15"><Plus className="h-3 w-3 mr-1" />Fazla</Badge>
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-200">
      <Toaster
        position="top-center"
        richColors
        theme={darkMode ? "dark" : "light"}
        toastOptions={{ style: { fontSize: "0.95rem" } }}
        visibleToasts={3}
      />
      <div className="container mx-auto p-3 sm:p-5 max-w-3xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h1 className="flex items-center gap-2 text-lg sm:text-xl font-bold tracking-tight">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <ScanBarcode className="h-4 w-4" />
            </span>
            <span>
              Stok<span className="text-primary">zen</span>
            </span>
            <span className="hidden sm:inline text-muted-foreground font-medium">Stok Sayım</span>
          </h1>
          <div className="flex gap-1">
            {magazaAuth ? (
              <Button
                asChild
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 max-w-44"
                title={`${magazaAuth.storeName} mağazasına devam et`}
              >
                <Link
                  href={magazaAuth.role === "admin" ? "/magaza/panel" : "/magaza/sayim"}
                >
                  <Store className="h-4 w-4 shrink-0 text-primary" />
                  <span className="truncate">
                    {magazaAuth.storeName}
                    <span className="hidden sm:inline text-muted-foreground">
                      {" "}· devam
                    </span>
                  </span>
                </Link>
              </Button>
            ) : (
              <Button
                asChild
                variant="outline"
                size="sm"
                className="h-8 gap-1.5"
                title="Çok kişili mağaza sayımı"
              >
                <Link href="/magaza">
                  <Store className="h-4 w-4" />
                  <span className="hidden sm:inline">Mağaza Modu</span>
                </Link>
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              onClick={() => setSoundEnabled(!soundEnabled)}
              title={soundEnabled ? "Sesi Kapat" : "Sesi Aç"}
            >
              {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              onClick={() => setDarkMode(!darkMode)}
              title={darkMode ? "Açık Tema" : "Koyu Tema"}
            >
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Count Session Bar */}
        <Card className="mb-3 py-0 gap-0">
          <CardContent className="px-2.5 py-2">
            <div className="flex items-center gap-1.5">
              <ClipboardList className="h-4 w-4 text-primary shrink-0 ml-1" />
              <select
                value={activeSessionId ?? ""}
                onChange={(e) => switchSession(e.target.value)}
                className="flex-1 min-w-0 h-8 rounded-md border border-input bg-background px-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring"
                title="Sayım seç — yeni sayım başlatınca mevcut olan dondurulur"
              >
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground"
                onClick={() => {
                  const current = sessions.find(s => s.id === activeSessionId)
                  setRenameValue(current?.name ?? "")
                  setRenameDialogOpen(true)
                }}
                title="Sayımı yeniden adlandır"
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    title="Bu sayımı sil"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Bu sayımı sil?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {`"${sessions.find(s => s.id === activeSessionId)?.name ?? ""}" sayımı ve içindeki tüm veriler silinecek. Bu işlem geri alınamaz.`}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>İptal</AlertDialogCancel>
                    <AlertDialogAction onClick={deleteActiveSession}>Sil</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button type="button" size="sm" className="h-8" onClick={newSession}>
                <PlusCircle className="h-4 w-4 sm:mr-1.5" />
                <span className="hidden sm:inline">Yeni Sayım</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Rename Session Dialog */}
        <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Sayımı yeniden adlandır</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                renameSession()
              }}
              className="flex flex-col gap-3"
            >
              <Input
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                placeholder="Sayım adı (örn. Depo A)"
                autoFocus
                maxLength={40}
              />
              <Button type="submit" disabled={!renameValue.trim()}>
                Kaydet
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        {/* Last Scanned Indicator */}
        {lastScannedPersistent && (
          <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <ScanBarcode className="h-4 w-4 text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground leading-tight">Son Okutulan</p>
                <p className="font-mono text-base font-bold text-primary leading-tight truncate">{lastScannedPersistent}</p>
              </div>
            </div>
            {items.find(i => i.barcode === lastScannedPersistent) && (
              <Badge variant="secondary" className="font-mono text-sm shrink-0">
                {items.find(i => i.barcode === lastScannedPersistent)?.quantity} adet
              </Badge>
            )}
          </div>
        )}

        {/* Input Section */}
        <Card className="mb-3 py-0 gap-0">
          <CardContent className="p-3 sm:p-4">
            <form onSubmit={handleBarcodeScan} className="flex flex-col sm:flex-row gap-2">
              <div className="flex flex-1 gap-2">
                <Input
                  id="barcode"
                  ref={barcodeInputRef}
                  type="text"
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  placeholder="Barkod okutun veya yazın..."
                  className="font-mono text-base h-11 flex-1 min-w-0"
                  autoComplete="off"
                  autoFocus
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-11 w-11 shrink-0 bg-transparent"
                  onClick={() => setCameraOpen(true)}
                  title="Kamera ile Okut"
                >
                  <Camera className="h-5 w-5" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-11 w-11 shrink-0 bg-transparent"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={photoBusy}
                  title="Fotoğraftan Okut (galeri veya çekim)"
                >
                  <ImageUp className="h-5 w-5" />
                </Button>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoSelected}
                  className="hidden"
                />
              </div>
              <Button type="submit" className="h-11 px-5">
                <Plus className="h-4 w-4 mr-1.5" />
                Ekle{quickMode ? ` (${quickQty})` : ""}
              </Button>
            </form>

            {/* Quick Add Mode */}
            <div className="mt-3 pt-3 border-t">
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  type="button"
                  variant={quickMode ? "default" : "outline"}
                  size="sm"
                  onClick={() => setQuickMode(!quickMode)}
                  className={`h-8 ${quickMode ? "" : "bg-transparent"}`}
                >
                  <Zap className={`h-3.5 w-3.5 mr-1 ${quickMode ? "fill-current" : ""}`} />
                  Hızlı Ekleme
                </Button>
                {quickMode && (
                  <div className="flex flex-wrap gap-1">
                    {[1, 5, 10, 20, 50, 100].map((qty) => (
                      <Button
                        key={qty}
                        type="button"
                        variant={quickQty === qty ? "secondary" : "ghost"}
                        size="sm"
                        className={`h-8 min-w-10 px-2 font-mono ${quickQty === qty ? "ring-1 ring-primary/40 text-primary font-bold" : "text-muted-foreground"}`}
                        onClick={() => setQuickQty(qty)}
                      >
                        {qty}
                      </Button>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground basis-full mt-1">
                  {quickMode ? (
                    <>Her okutmada <b>{quickQty} adet</b> eklenir, kamera açık kalır.</>
                  ) : (
                    <>Okutunca adet soran pencere açılır.</>
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Camera Scanner Dialog */}
        <Dialog open={cameraOpen} onOpenChange={(open) => { if (!open) closeCamera() }}>
          <DialogContent
            className="sm:max-w-md"
            onCloseAutoFocus={(e) => {
              e.preventDefault()
              if (!qtyDialogOpen) barcodeInputRef.current?.focus()
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
              {quickMode && (
                <p className="text-xs text-center mt-1 text-primary font-medium">
                  <Zap className="h-3 w-3 inline mr-1" />
                  Hızlı mod: her okutmada {quickQty} adet eklenir, kamera açık kalır
                </p>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Quantity Numpad Dialog (normal mode) */}
        <Dialog open={qtyDialogOpen} onOpenChange={(open) => { if (!open) closeQtyDialog() }}>
          <DialogContent
            className="sm:max-w-sm"
            onCloseAutoFocus={(e) => {
              e.preventDefault()
              barcodeInputRef.current?.focus()
            }}
            onKeyDown={(e) => {
              if (e.key >= "0" && e.key <= "9") {
                e.preventDefault()
                pressDialogDigit(e.key)
              } else if (e.key === "Backspace") {
                e.preventDefault()
                dialogBackspace()
              } else if (e.key === "Enter") {
                e.preventDefault()
                confirmQtyDialog()
              }
            }}
          >
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ScanBarcode className="h-5 w-5 text-primary" />
                Adet Girin
              </DialogTitle>
            </DialogHeader>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="font-mono font-bold break-all">{pendingBarcode}</span>
              {pendingExisting && (
                <Badge variant="secondary">Listede: {pendingExisting.quantity} adet</Badge>
              )}
            </div>
            <div className="h-16 rounded-md border bg-muted/30 flex items-center justify-center font-mono text-4xl font-bold">
              {dialogQty || <span className="text-muted-foreground text-2xl">adet</span>}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[1, 5, 10, 20].map((qty) => (
                <Button
                  key={qty}
                  type="button"
                  variant={dialogQty === String(qty) ? "default" : "secondary"}
                  className="h-11 text-lg font-mono"
                  onClick={() => {
                    setDialogQty(String(qty))
                    dialogPristineRef.current = true
                  }}
                >
                  {qty}
                </Button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                <Button
                  key={d}
                  type="button"
                  variant="outline"
                  className="h-14 text-2xl font-mono bg-transparent"
                  onClick={() => pressDialogDigit(d)}
                >
                  {d}
                </Button>
              ))}
              <Button
                type="button"
                variant="outline"
                className="h-14 text-lg bg-transparent text-muted-foreground"
                onClick={dialogClear}
                title="Temizle"
              >
                C
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-14 text-2xl font-mono bg-transparent"
                onClick={() => pressDialogDigit("0")}
              >
                0
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-14 bg-transparent"
                onClick={dialogBackspace}
                title="Sil"
              >
                <Delete className="h-6 w-6" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-12 bg-transparent"
                onClick={closeQtyDialog}
              >
                İptal
              </Button>
              <Button
                type="button"
                className="h-12 text-lg"
                onClick={confirmQtyDialog}
                disabled={!dialogQty || parseInt(dialogQty) < 1}
              >
                <Plus className="h-5 w-5 mr-1.5" />
                Ekle
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!deleteConfirmBarcode} onOpenChange={(open) => !open && setDeleteConfirmBarcode(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Ürünü sil?</AlertDialogTitle>
              <AlertDialogDescription>
                <span className="font-mono font-bold">{deleteConfirmBarcode}</span> barkodlu ürün silinecek. Bu işlem geri alınamaz.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>İptal</AlertDialogCancel>
              <AlertDialogAction onClick={() => deleteConfirmBarcode && confirmDelete(deleteConfirmBarcode)}>
                Sil
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Decrement Confirmation Dialog */}
        <AlertDialog open={!!decrementConfirmBarcode} onOpenChange={(open) => !open && setDecrementConfirmBarcode(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Adedi azalt?</AlertDialogTitle>
              <AlertDialogDescription>
                <span className="font-mono font-bold">{decrementConfirmBarcode}</span> barkodlu ürünün adedi 1 azaltılacak.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>İptal</AlertDialogCancel>
              <AlertDialogAction onClick={() => decrementConfirmBarcode && confirmDecrement(decrementConfirmBarcode)}>
                Azalt
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "count" | "compare")} className="mb-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="count">Sayım Listesi</TabsTrigger>
            <TabsTrigger value="compare">
              Karşılaştırma
              {stockItems.length > 0 && (
                <Badge variant="secondary" className="ml-2">{stockItems.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="count" className="mt-3">
            {/* Stats & Actions */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <div className="flex gap-2">
                <div className="rounded-lg border bg-card px-3 py-1.5 min-w-[84px]">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground leading-tight">Toplam Ürün</p>
                  <p className="text-lg font-bold leading-snug tabular-nums">{totalQuantity}</p>
                </div>
                <div className="rounded-lg border bg-card px-3 py-1.5 min-w-[84px]">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground leading-tight">Farklı Barkod</p>
                  <p className="text-lg font-bold leading-snug tabular-nums">{totalUniqueItems}</p>
                </div>
              </div>

              <div className="flex gap-1.5 flex-wrap sm:ml-auto">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-9" disabled={items.length === 0}>
                      <Download className="h-4 w-4 mr-1.5" />
                      Dışa Aktar
                      <ChevronDown className="h-3.5 w-3.5 ml-1 opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={handleExportCountXLSX}>
                      <FileSpreadsheet className="text-green-600" />
                      Excel (.xlsx)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleExportCountCSV}>
                      <FileText className="text-blue-600" />
                      CSV (.csv)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleExportCountPDF}>
                      <Printer className="text-red-600" />
                      PDF / Yazdır
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="outline" size="sm" className="h-9" onClick={handleShareCount} disabled={items.length === 0}>
                  <Share2 className="h-4 w-4 mr-1.5" />
                  Paylaş
                </Button>
                <Button variant="outline" size="sm" className="h-9" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-4 w-4 mr-1.5" />
                  CSV Yükle
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={importFromCSV}
                  className="hidden"
                />
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="h-9 text-destructive hover:text-destructive" disabled={items.length === 0}>
                      <RotateCcw className="h-4 w-4 mr-1.5" />
                      Temizle
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Tüm listeyi temizle?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Bu işlem geri alınamaz. Tüm sayım verileriniz silinecek.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>İptal</AlertDialogCancel>
                      <AlertDialogAction onClick={clearAll}>Temizle</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>

            {/* Search */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Barkod ara..."
                className="pl-9 h-10 bg-card"
              />
            </div>

            {/* Table */}
            <Card className="py-0 gap-0 overflow-hidden">
              <CardContent className="p-0">
                {items.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <ScanBarcode className="h-10 w-10 mx-auto mb-3 opacity-40" />
                    <p className="font-medium">Henüz ürün eklenmedi</p>
                    <p className="text-sm mt-1">Barkod okutarak başlayın</p>
                  </div>
                ) : filteredItems.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <p className="font-medium">Sonuç bulunamadı</p>
                    <p className="text-sm mt-1">{`"${searchQuery}" ile eşleşen barkod yok`}</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-card z-10 shadow-[0_1px_0_0_var(--border)]">
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="h-9 px-3 text-xs">Barkod</TableHead>
                          <TableHead className="h-9 text-center text-xs">Adet</TableHead>
                          <TableHead className="h-9 px-3 text-right text-xs">İşlemler</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredItems.map((item) => (
                          <TableRow
                            key={item.barcode}
                            data-barcode={item.barcode}
                            className={`transition-colors duration-300 ${lastScanned === item.barcode ? "bg-primary/15" : item.barcode === lastScannedPersistent ? "bg-primary/5" : ""}`}
                          >
                            <TableCell className="font-mono text-[13px] px-3 py-1.5">{item.barcode}</TableCell>
                            <TableCell className="text-center font-bold tabular-nums py-1.5">{item.quantity}</TableCell>
                            <TableCell className="px-3 py-1.5">
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-7 w-7 bg-transparent"
                                  onClick={() => setDecrementConfirmBarcode(item.barcode)}
                                  disabled={item.quantity <= 1}
                                >
                                  <Minus className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-7 w-7 bg-transparent"
                                  onClick={() => incrementQuantity(item.barcode)}
                                >
                                  <Plus className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => setDeleteConfirmBarcode(item.barcode)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="compare" className="mt-3">
            {/* Instructions (collapsible) */}
            <Card className="mb-3 py-0 gap-0 border-primary/25 bg-primary/5">
              <CardContent className="px-3 py-2.5">
                <details>
                  <summary className="text-sm font-medium cursor-pointer select-none">
                    Nasıl kullanılır?
                  </summary>
                  <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside mt-2">
                    <li><strong>Sayımdan önce:</strong> Mevcut stok listenizi CSV olarak yükleyin</li>
                    <li><strong>Sayım yapın:</strong> "Sayım Listesi" sekmesinden barkodları okutun</li>
                    <li><strong>Karşılaştırın:</strong> Bu sekmede farklar otomatik hesaplanır</li>
                  </ol>
                  <div className="mt-2 p-2 bg-muted rounded-md text-xs">
                    <span className="font-medium">CSV formatı: </span>
                    <code>Barkod;Adet</code> veya <code>Barkod,Adet</code>
                    <span className="text-muted-foreground"> — ilk satır başlık olabilir</span>
                  </div>
                </details>
              </CardContent>
            </Card>

            {/* Stock Upload Section */}
            <Card className="mb-3 py-0 gap-0">
              <CardContent className="p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-[150px]">
                    <Package className="h-4 w-4 text-primary shrink-0" />
                    {stockItems.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Stok dosyanızı yükleyin</p>
                    ) : (
                      <p className="text-sm">
                        <span className="font-bold">{stockItems.length}</span> ürün · toplam <span className="font-bold">{stockItems.reduce((s, i) => s + i.quantity, 0)}</span> adet
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    <Button variant="outline" size="sm" className="h-9" onClick={downloadSampleCSV}>
                      <Download className="h-4 w-4 mr-1.5" />
                      Örnek
                    </Button>
                    <Button variant="outline" size="sm" className="h-9" onClick={() => stockFileInputRef.current?.click()}>
                      <Upload className="h-4 w-4 mr-1.5" />
                      Stok CSV Yükle
                    </Button>
                    <input
                      ref={stockFileInputRef}
                      type="file"
                      accept=".csv"
                      onChange={importStockFromCSV}
                      className="hidden"
                    />
                    {stockItems.length > 0 && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Stok verisini sil?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Yüklenen stok verisi silinecek. Sayım verileri etkilenmez.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>İptal</AlertDialogCancel>
                            <AlertDialogAction onClick={clearStock}>Sil</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Comparison Stats */}
            {stockItems.length > 0 && items.length > 0 && (
              <div className="grid grid-cols-4 gap-1.5 sm:gap-2 mb-3">
                <div className="rounded-lg border border-l-4 border-l-green-500 bg-card px-2 py-1.5">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground leading-tight">Eşit</p>
                  <p className="text-lg font-bold text-green-600 dark:text-green-400 leading-snug tabular-nums">{matchCount}</p>
                </div>
                <div className="rounded-lg border border-l-4 border-l-amber-500 bg-card px-2 py-1.5">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground leading-tight">Farklı</p>
                  <p className="text-lg font-bold text-amber-600 dark:text-amber-400 leading-snug tabular-nums">{diffCount}</p>
                </div>
                <div className="rounded-lg border border-l-4 border-l-red-500 bg-card px-2 py-1.5">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground leading-tight">Sayılmadı</p>
                  <p className="text-lg font-bold text-red-600 dark:text-red-400 leading-snug tabular-nums">{onlyStockCount}</p>
                </div>
                <div className="rounded-lg border border-l-4 border-l-blue-500 bg-card px-2 py-1.5">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground leading-tight">Fazla</p>
                  <p className="text-lg font-bold text-blue-600 dark:text-blue-400 leading-snug tabular-nums">{onlyCountCount}</p>
                </div>
              </div>
            )}

            {/* Export Comparison */}
            {stockItems.length > 0 && items.length > 0 && (
              <div className="mb-3 flex gap-1.5 flex-wrap">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-9">
                      <Download className="h-4 w-4 mr-1.5" />
                      Dışa Aktar
                      <ChevronDown className="h-3.5 w-3.5 ml-1 opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={handleExportCompareXLSX}>
                      <FileSpreadsheet className="text-green-600" />
                      Excel (.xlsx)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleExportCompareCSV}>
                      <FileText className="text-blue-600" />
                      CSV (.csv)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleExportComparePDF}>
                      <Printer className="text-red-600" />
                      PDF / Yazdır
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="outline" size="sm" className="h-9" onClick={handleShareCompare}>
                  <Share2 className="h-4 w-4 mr-1.5" />
                  Paylaş
                </Button>
              </div>
            )}

            {/* Search */}
            {stockItems.length > 0 && (
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Barkod ara..."
                  className="pl-9 h-10 bg-card"
                />
              </div>
            )}

            {/* Comparison Table */}
            <Card className="py-0 gap-0 overflow-hidden">
              <CardContent className="p-0">
                {stockItems.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
                    <p className="font-medium">Stok verisi yüklenmedi</p>
                    <p className="text-sm mt-1">Karşılaştırma için önce stok CSV dosyanızı yükleyin</p>
                  </div>
                ) : items.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <ScanBarcode className="h-10 w-10 mx-auto mb-3 opacity-40" />
                    <p className="font-medium">Sayım yapılmadı</p>
                    <p className="text-sm mt-1">Karşılaştırma için barkod okutarak sayım yapın</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-card z-10 shadow-[0_1px_0_0_var(--border)]">
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="h-9 px-3 text-xs">Barkod</TableHead>
                          <TableHead className="h-9 text-center text-xs">Stok</TableHead>
                          <TableHead className="h-9 text-center text-xs">Sayım</TableHead>
                          <TableHead className="h-9 text-center text-xs">Fark</TableHead>
                          <TableHead className="h-9 px-3 text-right text-xs">Durum</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredComparison.map((item) => (
                          <TableRow
                            key={item.barcode}
                            className={getStatusStyle(item.status)}
                          >
                            <TableCell className="font-mono text-[13px] px-3 py-1.5">{item.barcode}</TableCell>
                            <TableCell className="text-center py-1.5 tabular-nums">{item.stockQty || "-"}</TableCell>
                            <TableCell className="text-center py-1.5 tabular-nums">{item.countQty || "-"}</TableCell>
                            <TableCell className="text-center font-bold py-1.5 tabular-nums">
                              {item.status === "match" ? "0" :
                               item.status === "only-stock" ? `-${item.stockQty}` :
                               item.status === "only-count" ? `+${item.countQty}` :
                               (item.countQty - item.stockQty > 0 ? "+" : "") + (item.countQty - item.stockQty)}
                            </TableCell>
                            <TableCell className="text-right px-3 py-1.5">
                              {getStatusBadge(item.status)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground mt-4">
          Veriler tarayıcınızda otomatik olarak kaydedilir
        </p>
        <PoweredByStokzen />
      </div>
    </div>
  )
}

export default function InventoryCounter() {
  return (
    <Suspense fallback={null}>
      <InventoryCounterContent />
    </Suspense>
  )
}
