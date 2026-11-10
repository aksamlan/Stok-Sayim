import type {
  CatalogItem,
  DashboardResult,
  DashboardRow,
  QueuedEvent,
  Role,
  SessionInfo,
} from "./types"

export class AuthExpiredError extends Error {
  constructor() {
    super("Oturum süresi doldu, tekrar giriş yap")
  }
}

export class ApiHttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(
  path: string,
  options: { method?: string; token?: string; body?: unknown } = {}
): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      method: options.method ?? "GET",
      headers: {
        ...(options.body !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    })
  } catch {
    throw new Error("Sunucuya ulaşılamadı")
  }
  // 401 yalnız token GÖNDERİLMİŞKEN "oturum doldu" demektir; girişte 401,
  // sunucunun "kod veya şifre hatalı" mesajıdır ve kullanıcıya aynen gösterilir.
  if (res.status === 401 && options.token) throw new AuthExpiredError()
  let data: unknown = null
  try {
    data = await res.json()
  } catch {}
  if (!res.ok) {
    const msg =
      data && typeof data === "object" && data !== null && "error" in data
        ? String((data as { error: unknown }).error)
        : `Sunucu hatası (${res.status})`
    throw new ApiHttpError(res.status, msg)
  }
  return data as T
}

export type JoinResult = {
  token: string
  role: Role
  storeId: string
  storeName: string
  counter?: string
}

export function apiCreateStore(body: {
  name: string
  countPassword: string
  adminPassword: string
  email?: string
  phone?: string
  verifyToken?: string
  verifyCode?: string
}): Promise<JoinResult & { code: string }> {
  return request("/api/store", { method: "POST", body })
}

export function apiStartVerification(
  email: string
): Promise<{ required: boolean; token?: string }> {
  return request("/api/store/dogrulama", { method: "POST", body: { email } })
}

export function apiJoinStore(body: {
  code: string
  password: string
  counterName?: string
  pin?: string
}): Promise<JoinResult> {
  return request("/api/store/join", { method: "POST", body })
}

export function apiJoinNames(body: {
  code: string
  password: string
}): Promise<{ counters: { name: string; hasPin: boolean }[] }> {
  return request("/api/store/counters", { method: "POST", body })
}

export function apiCounters(
  token: string
): Promise<{ counters: { name: string; createdAt: number }[] }> {
  return request("/api/counters", { token })
}

export function apiResetCounterPin(token: string, name: string): Promise<{ ok: true }> {
  return request(`/api/counters?name=${encodeURIComponent(name)}`, {
    method: "DELETE",
    token,
  })
}

export function apiSessions(token: string): Promise<{ sessions: SessionInfo[] }> {
  return request("/api/sessions", { token })
}

export function apiCreateSession(token: string, name: string): Promise<{ id: string }> {
  return request("/api/sessions", { method: "POST", token, body: { name } })
}

export function apiCloseSession(token: string, id: string): Promise<{ ok: true }> {
  return request("/api/sessions", {
    method: "PATCH",
    token,
    body: { id, status: "closed" },
  })
}

export function apiGetCatalog(
  token: string,
  since?: number
): Promise<{ version: number; unchanged?: true; items?: CatalogItem[] }> {
  const q = since !== undefined ? `?since=${since}` : ""
  return request(`/api/catalog${q}`, { token })
}

export function apiCatalogCount(
  token: string
): Promise<{ version: number; count: number }> {
  return request("/api/catalog?countOnly=1", { token })
}

export function apiPutCatalog(
  token: string,
  items: CatalogItem[]
): Promise<{ count: number; version: number }> {
  return request("/api/catalog", { method: "PUT", token, body: { items } })
}

export function apiPostScan(
  token: string,
  events: QueuedEvent[]
): Promise<{ accepted: number }> {
  return request("/api/scan", { method: "POST", token, body: { events } })
}

export function apiMyCounts(
  token: string,
  sessionId: string
): Promise<{ items: { barcode: string; qty: number }[] }> {
  return request(`/api/my-counts?sessionId=${encodeURIComponent(sessionId)}`, {
    token,
  })
}

export function apiDashboard(
  token: string,
  params: {
    sessionId: string
    filter: "problems" | "all"
    search?: string
    category?: string
    page: number
  }
): Promise<DashboardResult> {
  const q = new URLSearchParams({
    sessionId: params.sessionId,
    filter: params.filter,
    page: String(params.page),
  })
  if (params.search) q.set("search", params.search)
  if (params.category) q.set("category", params.category)
  return request(`/api/dashboard?${q}`, { token })
}

export function apiDashboardExport(
  token: string,
  sessionId: string,
  page: number
): Promise<{ rows: DashboardRow[]; rowTotal: number }> {
  const q = new URLSearchParams({ sessionId, page: String(page) })
  return request(`/api/dashboard/export?${q}`, { token })
}
