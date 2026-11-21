export type Role = "counter" | "admin"

export type StoreAuth = {
  token: string
  role: Role
  storeId: string
  storeName: string
  counter: string
  code: string
}

export type CatalogItem = {
  barcode: string
  name: string
  category: string | null
  expected: number | null
  salePrice?: number | null
  costPrice?: number | null
}

export type CatalogEntry = {
  name: string
  category: string | null
  expected: number | null
}

export type SessionInfo = {
  id: string
  name: string
  status: "active" | "closed"
  createdAt: number
}

export type QueuedEvent = {
  id: string
  sessionId: string
  barcode: string
  qty: number
  createdAt: number
}

export type DashboardRow = {
  salePrice: number | null
  costPrice: number | null
  diffQty: number
  diffSale: number | null
  diffCost: number | null
  barcode: string
  name: string | null
  category: string | null
  expected: number | null
  counted: number
  status: "match" | "difference" | "only-stock" | "only-count"
}

export type ValueTotals = {
  saleCounted: number
  saleExpected: number
  costCounted: number
  costExpected: number
  salePriced: number
  costPriced: number
  countedNoSale: number
  countedNoCost: number
  negativeStock: number
}

export type DashboardResult = {
  totals: {
    totalQty: number
    distinctCounted: number
    counters: number
    unknownCount: number
    catalogCount: number
    value: ValueTotals
  }
  byCounter: { counter: string; qty: number; distinct: number; lastAt: number }[]
  byCategory: {
    category: string | null
    counted: number
    expected: number
    distinct: number
  }[]
  rows: DashboardRow[]
  rowTotal: number
  // Sunucu saati (ms): panel "x dk önce" hesabını kendi cihaz saatine göre değil buna göre yapar
  serverNow: number
}

export type SyncState = {
  pending: number
  lastOkAt: number | null
  online: boolean
  authExpired?: boolean
  // Kapatılmış/silinmiş bir sayıma ait olduğu için gönderilemeyip kuyruktan
  // düşürülen olayların kümülatif sayısı (kullanıcıya uyarı göstermek için).
  droppedTotal?: number
  // Emanet deposunda (dead-letter) bekleyen, CSV olarak kurtarılabilir okutma sayısı.
  deadTotal?: number
}
