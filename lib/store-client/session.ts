import type { StoreAuth } from "./types"

// Bu cihazda birden fazla mağazaya giriş yapılabilir (ör. iki şube): "magazaAuth"
// şu an AÇIK olan oturumdur, "magazaOturumlar" ise giriş yapılan tüm mağaza
// oturumlarının listesidir (giriş ekranında "Devam et" olarak gösterilir).
const KEY = "magazaAuth"
const LIST_KEY = "magazaOturumlar"

const sameSession = (a: StoreAuth, b: StoreAuth) =>
  a.storeId === b.storeId && a.role === b.role && (a.counter ?? "") === (b.counter ?? "")

function tokenExpired(token: string): boolean {
  try {
    const part = token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/")
    const payload = JSON.parse(decodeURIComponent(escape(atob(part)))) as { exp?: number }
    return typeof payload.exp === "number" && payload.exp < Date.now()
  } catch {
    return false // çözemiyorsak silme: sunucu doğrular
  }
}

const valid = (a: unknown): a is StoreAuth =>
  !!a && typeof (a as StoreAuth).token === "string" && !!(a as StoreAuth).storeId

export function loadAuth(): StoreAuth | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const auth = JSON.parse(raw) as StoreAuth
    if (!auth.token || !auth.storeId) return null
    return auth
  } catch {
    return null
  }
}

function readList(): StoreAuth[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LIST_KEY) ?? "[]")
    return Array.isArray(raw) ? raw.filter(valid) : []
  } catch {
    return []
  }
}

function writeList(list: StoreAuth[]): void {
  try {
    localStorage.setItem(LIST_KEY, JSON.stringify(list))
  } catch {}
}

// Giriş yapılmış tüm mağaza oturumları (açık olan dahil, süresi dolanlar hariç).
export function loadAllAuths(): StoreAuth[] {
  if (typeof window === "undefined") return []
  const list = readList()
  const cur = loadAuth()
  if (cur && !list.some((a) => sameSession(a, cur))) list.unshift(cur) // eski sürümden geçiş
  return list.filter((a) => !tokenExpired(a.token))
}

export function saveAuth(auth: StoreAuth): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(auth))
  } catch {}
  writeList([auth, ...readList().filter((a) => !sameSession(a, auth))])
}

// Listeden bir mağaza oturumunu açık oturum yapar ("Devam et").
export function switchAuth(auth: StoreAuth): void {
  saveAuth(auth)
}

// Yalnızca ŞU AN açık oturumu kapatır; diğer mağazalar listede kalır.
export function clearAuth(): void {
  const cur = loadAuth()
  try {
    localStorage.removeItem(KEY)
  } catch {}
  if (cur) writeList(readList().filter((a) => !sameSession(a, cur)))
}

// Listedeki belirli bir oturumu çıkarır (açık olansa onu da kapatır).
export function removeAuth(auth: StoreAuth): void {
  const cur = loadAuth()
  if (cur && sameSession(cur, auth)) {
    try {
      localStorage.removeItem(KEY)
    } catch {}
  }
  writeList(readList().filter((a) => !sameSession(a, auth)))
}
