import type { StoreAuth } from "./types"

const KEY = "magazaAuth"

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

export function saveAuth(auth: StoreAuth): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(auth))
  } catch {}
}

export function clearAuth(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {}
}
