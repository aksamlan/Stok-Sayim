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
  barcode: string
  name: string | null
  category: string | null
  expected: number | null
  counted: number
  status: "match" | "difference" | "only-stock" | "only-count"
}

export type DashboardResult = {
  totals: {
    totalQty: number
    distinctCounted: number
    counters: number
    unknownCount: number
    catalogCount: number
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
}

export type SyncState = {
  pending: number
  lastOkAt: number | null
  online: boolean
  authExpired?: boolean
}
