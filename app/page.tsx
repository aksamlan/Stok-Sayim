"use client"

import React, { Suspense, useState, useEffect, useRef, useCallback } from "react"
import { Plus, Minus, Trash2, Download, Upload, Moon, Sun, Search, Volume2, VolumeX, RotateCcw, Camera, ScanBarcode, Package, AlertTriangle, CheckCircle2, XCircle, Zap, ClipboardList, Pencil, PlusCircle } from "lucide-react"
import { Toaster, toast } from "sonner"
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
  const [quantityInput, setQuantityInput] = useState("1")
  const [quickMode, setQuickMode] = useState(false)
  const [quickQty, setQuickQty] = useState(1)
  const [searchQuery, setSearchQuery] = useState("")
  const [darkMode, setDarkMode] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [lastScanned, setLastScanned] = useState<string | null>(null)
  const [lastScannedPersistent, setLastScannedPersistent] = useState<string | null>(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<"count" | "compare">("count")
  const [deleteConfirmBarcode, setDeleteConfirmBarcode] = useState<string | null>(null)
  const [decrementConfirmBarcode, setDecrementConfirmBarcode] = useState<string | null>(null)

  const barcodeInputRef = useRef<HTMLInputElement>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const stockFileInputRef = useRef<HTMLInputElement>(null)
  const scannerRef = useRef<HTMLDivElement>(null)
  const html5QrScannerRef = useRef<Html5QrcodeType>(null)
  const addBarcodeRef = useRef<((barcode: string, qty: number) => void) | null>(null)
  const itemsRef = useRef<InventoryItem[]>([])
  const quickModeRef = useRef(false)
  const quickQtyRef = useRef(1)
  const lastCamScanRef = useRef<{ code: string; time: number }>({ code: "", time: 0 })

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

  // Camera scanner setup/teardown using dynamic import
  useEffect(() => {
    if (!cameraOpen) return

    let cancelled = false
    let scannerInstance: Html5QrcodeType = null

    const initScanner = async () => {
      // Dynamic import to avoid SSR issues
      const { Html5Qrcode } = await import("html5-qrcode")
      
      if (cancelled || !scannerRef.current) return
      
      // Create a container div for the scanner
      const scannerId = "barcode-scanner-view"
      let scannerEl = document.getElementById(scannerId)
      if (!scannerEl) {
        scannerEl = document.createElement("div")
        scannerEl.id = scannerId
        scannerRef.current.appendChild(scannerEl)
      }

      const html5QrCode = new Html5Qrcode(scannerId)
      scannerInstance = html5QrCode
      html5QrScannerRef.current = html5QrCode

      try {
        await html5QrCode.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 250, height: 150 },
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
              // Normal mode: add once and close camera
              lastCamScanRef.current = { code, time: now }
              if (addBarcodeRef.current) {
                addBarcodeRef.current(code, 1)
              }
              html5QrCode.stop().catch(() => {})
              setCameraOpen(false)
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
        scannerInstance.stop().catch(() => {})
        scannerInstance.clear()
      }
    }
  }, [cameraOpen])

  // Handle barcode scan from input
  const handleBarcodeScan = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    
    const barcode = barcodeInput.trim()
    if (!barcode) return

    const qty = quickMode
      ? quickQty
      : Math.max(1, parseInt(quantityInput) || 1)

    addBarcodeToList(barcode, qty)

    setBarcodeInput("")
    setQuantityInput("1")
    barcodeInputRef.current?.focus()
  }, [barcodeInput, quantityInput, quickMode, quickQty, addBarcodeToList])

  // Adjust the manual quantity input with +/- buttons
  const adjustQuantity = (delta: number) => {
    const current = parseInt(quantityInput) || 1
    setQuantityInput(String(Math.max(1, current + delta)))
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

  // Export to Excel (XLS format with proper column separation)
  const exportToExcel = () => {
    const xmlHeader = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="Stok Sayım">
    <Table>
      <Column ss:Width="150"/>
      <Column ss:Width="80"/>
      <Row>
        <Cell><Data ss:Type="String">Barkod</Data></Cell>
        <Cell><Data ss:Type="String">Adet</Data></Cell>
      </Row>`
    
    const xmlRows = items.map(item => `
      <Row>
        <Cell><Data ss:Type="String">${item.barcode}</Data></Cell>
        <Cell><Data ss:Type="Number">${item.quantity}</Data></Cell>
      </Row>`).join("")
    
    const xmlFooter = `
    </Table>
  </Worksheet>
</Workbook>`
    
    const xml = xmlHeader + xmlRows + xmlFooter
    
    const blob = new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `stok_sayim_${new Date().toISOString().split("T")[0]}.xls`
    link.click()
    URL.revokeObjectURL(url)
  }

  // Export comparison to Excel
  const exportComparisonToExcel = () => {
    const comparison = getComparisonResults()
    
    const xmlHeader = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="match"><Interior ss:Color="#22c55e" ss:Pattern="Solid"/></Style>
    <Style ss:ID="diff"><Interior ss:Color="#f59e0b" ss:Pattern="Solid"/></Style>
    <Style ss:ID="onlyStock"><Interior ss:Color="#ef4444" ss:Pattern="Solid"/></Style>
    <Style ss:ID="onlyCount"><Interior ss:Color="#3b82f6" ss:Pattern="Solid"/></Style>
  </Styles>
  <Worksheet ss:Name="Karşılaştırma">
    <Table>
      <Column ss:Width="150"/>
      <Column ss:Width="80"/>
      <Column ss:Width="80"/>
      <Column ss:Width="80"/>
      <Column ss:Width="100"/>
      <Row>
        <Cell><Data ss:Type="String">Barkod</Data></Cell>
        <Cell><Data ss:Type="String">Stok</Data></Cell>
        <Cell><Data ss:Type="String">Sayım</Data></Cell>
        <Cell><Data ss:Type="String">Fark</Data></Cell>
        <Cell><Data ss:Type="String">Durum</Data></Cell>
      </Row>`
    
    const statusText = {
      "match": "Eşit",
      "difference": "Farklı",
      "only-stock": "Sadece Stok",
      "only-count": "Sadece Sayım"
    }
    
    const xmlRows = comparison.map(item => `
      <Row ss:StyleID="${item.status === "match" ? "match" : item.status === "difference" ? "diff" : item.status === "only-stock" ? "onlyStock" : "onlyCount"}">
        <Cell><Data ss:Type="String">${item.barcode}</Data></Cell>
        <Cell><Data ss:Type="Number">${item.stockQty}</Data></Cell>
        <Cell><Data ss:Type="Number">${item.countQty}</Data></Cell>
        <Cell><Data ss:Type="Number">${item.countQty - item.stockQty}</Data></Cell>
        <Cell><Data ss:Type="String">${statusText[item.status]}</Data></Cell>
      </Row>`).join("")
    
    const xmlFooter = `
    </Table>
  </Worksheet>
</Workbook>`
    
    const xml = xmlHeader + xmlRows + xmlFooter
    
    const blob = new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `stok_karsilastirma_${new Date().toISOString().split("T")[0]}.xls`
    link.click()
    URL.revokeObjectURL(url)
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
        return <Badge className="bg-green-500 hover:bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" />Eşit</Badge>
      case "difference":
        return <Badge className="bg-amber-500 hover:bg-amber-600"><AlertTriangle className="h-3 w-3 mr-1" />Farklı</Badge>
      case "only-stock":
        return <Badge className="bg-red-500 hover:bg-red-600"><XCircle className="h-3 w-3 mr-1" />Sayılmadı</Badge>
      case "only-count":
        return <Badge className="bg-blue-500 hover:bg-blue-600"><Plus className="h-3 w-3 mr-1" />Fazla</Badge>
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
      <div className="container mx-auto p-4 max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Stok Sayım</h1>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setSoundEnabled(!soundEnabled)}
              title={soundEnabled ? "Sesi Kapat" : "Sesi Aç"}
            >
              {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setDarkMode(!darkMode)}
              title={darkMode ? "Açık Tema" : "Koyu Tema"}
            >
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Count Session Bar */}
        <Card className="mb-4">
          <CardContent className="py-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <ClipboardList className="h-4 w-4 text-primary" />
                <span className="hidden sm:inline">Aktif Sayım</span>
              </div>
              <select
                value={activeSessionId ?? ""}
                onChange={(e) => switchSession(e.target.value)}
                className="flex-1 min-w-[140px] h-9 rounded-md border border-input bg-background px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring"
                title="Sayım seç"
              >
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="bg-transparent"
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
                    variant="outline"
                    size="sm"
                    className="bg-transparent text-destructive"
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
              <Button type="button" size="sm" onClick={newSession}>
                <PlusCircle className="h-4 w-4 mr-1.5" />
                Yeni Sayım
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Yeni sayım başlattığınızda mevcut sayım dondurulur; listeden seçerek kaldığınız yerden devam edersiniz.
            </p>
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
          <Card className="mb-4 border-primary/30 bg-primary/5">
            <CardContent className="py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <ScanBarcode className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-xs text-muted-foreground">Son Okutulan Barkod</p>
                    <p className="font-mono text-lg font-bold text-primary">{lastScannedPersistent}</p>
                  </div>
                </div>
                {items.find(i => i.barcode === lastScannedPersistent) && (
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Mevcut Adet</p>
                    <p className="text-lg font-bold">{items.find(i => i.barcode === lastScannedPersistent)?.quantity}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Input Section */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <form onSubmit={handleBarcodeScan} className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <label htmlFor="barcode" className="text-sm font-medium mb-2 block">
                  Barkod
                </label>
                <div className="flex gap-2">
                  <Input
                    id="barcode"
                    ref={barcodeInputRef}
                    type="text"
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    placeholder="Barkod okutun veya yazın..."
                    className="font-mono text-lg h-12"
                    autoComplete="off"
                    autoFocus
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-12 px-3 bg-transparent"
                    onClick={() => setCameraOpen(true)}
                    title="Kamera ile Okut"
                  >
                    <Camera className="h-5 w-5" />
                  </Button>
                </div>
              </div>
              {!quickMode && (
                <div className="w-full sm:w-52">
                  <label htmlFor="quantity" className="text-sm font-medium mb-2 block">
                    Adet
                  </label>
                  <div className="flex gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-12 w-12 shrink-0 bg-transparent"
                      onClick={() => adjustQuantity(-1)}
                      title="Adedi azalt"
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <Input
                      id="quantity"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={quantityInput}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9]/g, "")
                        setQuantityInput(val)
                      }}
                      onFocus={(e) => e.target.select()}
                      onBlur={() => {
                        if (!quantityInput || parseInt(quantityInput) < 1) {
                          setQuantityInput("1")
                        }
                      }}
                      className="font-mono text-lg h-12 text-center"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="h-12 w-12 shrink-0 bg-transparent"
                      onClick={() => adjustQuantity(1)}
                      title="Adedi artır"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
              <div className="flex items-end">
                <Button type="submit" className="h-12 px-6 w-full sm:w-auto">
                  <Plus className="h-4 w-4 mr-2" />
                  Ekle{quickMode ? ` (${quickQty})` : ""}
                </Button>
              </div>
            </form>

            {/* Quick Add Mode */}
            <div className="mt-4 pt-4 border-t">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant={quickMode ? "default" : "outline"}
                  size="sm"
                  onClick={() => setQuickMode(!quickMode)}
                  className={quickMode ? "" : "bg-transparent"}
                >
                  <Zap className={`h-4 w-4 mr-1.5 ${quickMode ? "fill-current" : ""}`} />
                  Hızlı Ekleme {quickMode ? "Açık" : "Kapalı"}
                </Button>
                <div className="flex flex-wrap gap-1.5">
                  {[1, 5, 10, 20, 50, 100].map((qty) => {
                    const selected = quickMode
                      ? quickQty === qty
                      : quantityInput === String(qty)
                    return (
                      <Button
                        key={qty}
                        type="button"
                        variant={selected ? "default" : "outline"}
                        size="sm"
                        className={`min-w-[44px] font-mono ${selected ? "" : "bg-transparent"}`}
                        onClick={() => {
                          if (quickMode) {
                            setQuickQty(qty)
                          } else {
                            setQuantityInput(String(qty))
                            barcodeInputRef.current?.focus()
                          }
                        }}
                      >
                        {qty}
                      </Button>
                    )
                  })}
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {quickMode ? (
                  <>Her okutmada <b>{quickQty} adet</b> otomatik eklenir. Kamera açık kalır, art arda okutabilirsiniz.</>
                ) : (
                  <>Sayıya dokununca Adet alanına yazılır; +/− ile de ayarlayabilirsiniz.</>
                )}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Camera Scanner Dialog */}
        <Dialog open={cameraOpen} onOpenChange={(open) => { if (!open) closeCamera() }}>
          <DialogContent className="sm:max-w-md">
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
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "count" | "compare")} className="mb-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="count">Sayım Listesi</TabsTrigger>
            <TabsTrigger value="compare">
              Karşılaştırma
              {stockItems.length > 0 && (
                <Badge variant="secondary" className="ml-2">{stockItems.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="count" className="mt-6">
            {/* Stats & Actions */}
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <Card className="flex-1">
                <CardContent className="py-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm text-muted-foreground">Toplam Ürün</p>
                      <p className="text-2xl font-bold">{totalQuantity}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Farklı Barkod</p>
                      <p className="text-2xl font-bold">{totalUniqueItems}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" onClick={exportToExcel} disabled={items.length === 0}>
                  <Download className="h-4 w-4 mr-2" />
                  Excel İndir
                </Button>
                <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-4 w-4 mr-2" />
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
                    <Button variant="destructive" disabled={items.length === 0}>
                      <RotateCcw className="h-4 w-4 mr-2" />
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
            <Card className="mb-6">
              <CardContent className="py-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Barkod ara..."
                    className="pl-10"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Table */}
            <Card>
              <CardHeader>
                <CardTitle>Sayım Listesi</CardTitle>
              </CardHeader>
              <CardContent>
                {items.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <p className="text-lg">Henüz ürün eklenmedi</p>
                    <p className="text-sm mt-2">Barkod okutarak başlayın</p>
                  </div>
                ) : filteredItems.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <p className="text-lg">Sonuç bulunamadı</p>
                    <p className="text-sm mt-2">{`"${searchQuery}" ile eşleşen barkod yok`}</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-background">
                        <TableRow>
                          <TableHead className="w-[50%]">Barkod</TableHead>
                          <TableHead className="text-center">Adet</TableHead>
                          <TableHead className="text-right">İşlemler</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredItems.map((item) => (
                          <TableRow 
                            key={item.barcode}
                            data-barcode={item.barcode}
                            className={`transition-colors duration-300 ${lastScanned === item.barcode ? "bg-primary/20 ring-1 ring-primary/40" : item.barcode === lastScannedPersistent ? "bg-primary/5" : ""}`}
                          >
                            <TableCell className="font-mono">{item.barcode}</TableCell>
                            <TableCell className="text-center font-bold text-lg">{item.quantity}</TableCell>
                            <TableCell>
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8 bg-transparent"
                                  onClick={() => setDecrementConfirmBarcode(item.barcode)}
                                  disabled={item.quantity <= 1}
                                >
                                  <Minus className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8 bg-transparent"
                                  onClick={() => incrementQuantity(item.barcode)}
                                >
                                  <Plus className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="icon"
                                  className="h-8 w-8"
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

          <TabsContent value="compare" className="mt-6">
            {/* Instructions Card */}
            <Card className="mb-6 border-blue-500/30 bg-blue-500/5">
              <CardContent className="py-4">
                <h3 className="font-semibold mb-2">Nasıl Kullanılır?</h3>
                <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                  <li><strong>Sayımdan önce:</strong> Mevcut stok listenizi CSV olarak yükleyin (aşağıdaki butonu kullanın)</li>
                  <li><strong>Sayım yapın:</strong> "Sayım Listesi" sekmesinden barkodları okutarak sayım yapın</li>
                  <li><strong>Karşılaştırın:</strong> Bu sekmeye dönüp sonuçları görün - farklar otomatik hesaplanır</li>
                </ol>
                <div className="mt-3 p-3 bg-muted rounded-md">
                  <p className="text-xs font-medium mb-1">CSV Formatı:</p>
                  <code className="text-xs">Barkod;Adet</code> veya <code className="text-xs">Barkod,Adet</code>
                  <p className="text-xs text-muted-foreground mt-1">İlk satır başlık olabilir (otomatik atlanır)</p>
                </div>
              </CardContent>
            </Card>

            {/* Stock Upload Section */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Mevcut Stok
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                  <div className="flex-1">
                    {stockItems.length === 0 ? (
                      <p className="text-muted-foreground">Karşılaştırma için mevcut stok dosyanızı yükleyin</p>
                    ) : (
                      <p className="text-sm">
                        <span className="font-bold">{stockItems.length}</span> farklı ürün, toplam <span className="font-bold">{stockItems.reduce((s, i) => s + i.quantity, 0)}</span> adet
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button variant="outline" onClick={downloadSampleCSV}>
                      <Download className="h-4 w-4 mr-2" />
                      Örnek CSV
                    </Button>
                    <Button variant="outline" onClick={() => stockFileInputRef.current?.click()}>
                      <Upload className="h-4 w-4 mr-2" />
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
                          <Button variant="outline" size="icon" className="bg-transparent">
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
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                <Card className="border-l-4 border-l-green-500">
                  <CardContent className="py-3">
                    <p className="text-xs text-muted-foreground">Eşit</p>
                    <p className="text-xl font-bold text-green-500">{matchCount}</p>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-amber-500">
                  <CardContent className="py-3">
                    <p className="text-xs text-muted-foreground">Farklı</p>
                    <p className="text-xl font-bold text-amber-500">{diffCount}</p>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-red-500">
                  <CardContent className="py-3">
                    <p className="text-xs text-muted-foreground">Sayılmadı</p>
                    <p className="text-xl font-bold text-red-500">{onlyStockCount}</p>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-blue-500">
                  <CardContent className="py-3">
                    <p className="text-xs text-muted-foreground">Fazla</p>
                    <p className="text-xl font-bold text-blue-500">{onlyCountCount}</p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Export Comparison */}
            {stockItems.length > 0 && items.length > 0 && (
              <div className="mb-6">
                <Button variant="outline" onClick={exportComparisonToExcel}>
                  <Download className="h-4 w-4 mr-2" />
                  Karşılaştırma Excel İndir
                </Button>
              </div>
            )}

            {/* Search */}
            {stockItems.length > 0 && (
              <Card className="mb-6">
                <CardContent className="py-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Barkod ara..."
                      className="pl-10"
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Comparison Table */}
            <Card>
              <CardHeader>
                <CardTitle>Karşılaştırma Sonuçları</CardTitle>
              </CardHeader>
              <CardContent>
                {stockItems.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="text-lg">Stok verisi yüklenmedi</p>
                    <p className="text-sm mt-2">Karşılaştırma için önce stok CSV dosyanızı yükleyin</p>
                  </div>
                ) : items.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <ScanBarcode className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="text-lg">Sayım yapılmadı</p>
                    <p className="text-sm mt-2">Karşılaştırma için barkod okutarak sayım yapın</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-background">
                        <TableRow>
                          <TableHead>Barkod</TableHead>
                          <TableHead className="text-center">Stok</TableHead>
                          <TableHead className="text-center">Sayım</TableHead>
                          <TableHead className="text-center">Fark</TableHead>
                          <TableHead className="text-right">Durum</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredComparison.map((item) => (
                          <TableRow 
                            key={item.barcode}
                            className={getStatusStyle(item.status)}
                          >
                            <TableCell className="font-mono">{item.barcode}</TableCell>
                            <TableCell className="text-center">{item.stockQty || "-"}</TableCell>
                            <TableCell className="text-center">{item.countQty || "-"}</TableCell>
                            <TableCell className="text-center font-bold">
                              {item.status === "match" ? "0" : 
                               item.status === "only-stock" ? `-${item.stockQty}` :
                               item.status === "only-count" ? `+${item.countQty}` :
                               (item.countQty - item.stockQty > 0 ? "+" : "") + (item.countQty - item.stockQty)}
                            </TableCell>
                            <TableCell className="text-right">
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
        <p className="text-center text-sm text-muted-foreground mt-6">
          Veriler tarayıcınızda otomatik olarak kaydedilir
        </p>
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
