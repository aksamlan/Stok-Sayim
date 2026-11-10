# Mağaza Modu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Self-hosted multi-user store counting: store/password separation, per-counter identity, 100k-row product catalog with live name lookup, unknown-barcode flagging, offline-first sync, live merged admin dashboard.

**Architecture:** Next.js route handlers backed by Node 24's built-in `node:sqlite` (WAL, single file in `DATA_DIR`). Clients are offline-first: catalog cached in IndexedDB + in-memory Map, scans appended to an IndexedDB queue of idempotent events (client UUID PK, `INSERT OR IGNORE` server-side, additive merge). Admin dashboard polls SQL aggregates every 5s. Existing solo localStorage mode untouched.

**Tech Stack:** Next 16, React 19, node:sqlite, node:crypto (scrypt + HMAC), IndexedDB, vitest (new devDep, server lib tests only), existing `xlsx` + `lib/export.ts` + html5-qrcode config.

**Spec:** `docs/superpowers/specs/2026-11-10-magaza-modu-spec.md`

## Global Constraints

- Node >= 24 (node:sqlite). No new native dependencies. Only new deps: `vitest` (dev).
- Barcodes are ALWAYS strings end-to-end; scientific-notation values (`8.69E+12`) from Excel are rejected with a row error, numeric cells converted via String().
- All UI copy Turkish. Mağaza kodu alphabet: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, 6 chars.
- Every store-scoped query filters by token `storeId`; counter role never reads other counters' data.
- No endpoint returns unbounded lists: page size max 10000 (export), default 100 (dashboard tables).
- No change to solo-mode behavior in `app/page.tsx` beyond adding one header link.
- Commits after each task; attribution line `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## Review Focus

1. Duplicate sync after timeout (client retries a batch the server already stored) must not double-count → covered by `test_recordEvents_idempotent` (Task 5).
2. Excel numeric barcode cells (13-digit) must arrive as exact strings, scientific notation rejected → `parseCatalogRows` tests (Task 8).
3. Turkish characters (ğüşİı) in product names must survive upload → DB → dashboard → export → `test_catalog_turkish_names` (Task 4).
4. Token invalid/expired mid-count: queued events must survive (401 keeps queue, shows re-login) → client logic Task 7, smoke-tested Task 12.
5. Two counters scanning the same barcode concurrently must sum, with per-counter breakdown intact → `test_merge_two_counters_same_barcode` (Task 5).

---

### Task 1: SQLite layer + vitest setup

**Files:**
- Create: `lib/server/db.ts`, `vitest.config.ts`, `tests/server/db.test.ts`
- Modify: `package.json` (add `vitest` devDep, `"test": "vitest run"` script)

**Interfaces:**
- Produces: `openDatabase(path: string): DatabaseSync` (creates schema + WAL, idempotent); `getDb(): DatabaseSync` (singleton, `globalThis` cached for dev HMR, path `${process.env.DATA_DIR ?? "./data"}/stok.db`, mkdir -p); `getMeta(db, key: string): string | null`; `setMeta(db, key: string, value: string): void`
- Schema exactly as spec "Sunucu / depolama" section (all tables + indexes).

- [ ] Step 1: `pnpm add -D vitest`, add test script, minimal `vitest.config.ts` (node environment, include `tests/**/*.test.ts`).
- [ ] Step 2: Write failing tests: `test_schema_tables_exist` (open ':memory:', expect sqlite_master contains stores/sessions/products/scan_events/meta), `test_meta_roundtrip` (setMeta/getMeta), `test_open_idempotent` (openDatabase twice on same file path in temp dir — no throw).
- [ ] Step 3: Run `pnpm test` → FAIL (module not found).
- [ ] Step 4: Implement `lib/server/db.ts` with `node:sqlite` `DatabaseSync`, `PRAGMA journal_mode=WAL` (skip for ':memory:'), `CREATE TABLE IF NOT EXISTS ...`.
- [ ] Step 5: `pnpm test` → PASS. Commit `feat: sqlite katmani (node:sqlite) + vitest`.

### Task 2: Auth primitives

**Files:**
- Create: `lib/server/auth.ts`, `tests/server/auth.test.ts`

**Interfaces:**
- Produces: `hashPassword(pw: string): string` (scrypt, `salt:hex` format); `verifyPassword(pw: string, hash: string): boolean` (timingSafeEqual); `signToken(db: DatabaseSync, payload: TokenPayload): string`; `verifyToken(db: DatabaseSync, token: string): TokenPayload | null`; `type TokenPayload = { storeId: string; role: "counter" | "admin"; counter: string; exp: number }`; `requireAuth(db, req: Request, role?: "admin"): TokenPayload` (throws `ApiError(401|403, msg)`); `class ApiError extends Error { status: number }`
- Secret: `getMeta(db,"secret")` else generate 32-byte random hex and `setMeta`.
- Token format: `base64url(JSON payload) + "." + base64url(hmacSha256(secret, payloadB64))`.

- [ ] Step 1: Failing tests: `test_password_roundtrip`, `test_password_wrong_rejected`, `test_token_roundtrip`, `test_token_tamper_rejected` (flip one char), `test_token_expired_rejected` (exp in past), `test_requireAuth_admin_role` (counter token + role "admin" → ApiError 403).
- [ ] Step 2: Run → FAIL. Step 3: Implement. Step 4: PASS. Step 5: Commit `feat: scrypt sifre + hmac token`.

### Task 3: Stores & sessions lib + API routes

**Files:**
- Create: `lib/server/stores.ts`, `tests/server/stores.test.ts`, `app/api/store/route.ts`, `app/api/store/join/route.ts`, `app/api/sessions/route.ts`
- Create: `lib/server/http.ts` — `handle(fn: (req: Request) => Promise<Response> | Response): (req: Request) => Promise<Response>` wrapper catching `ApiError` → JSON `{error}` with status, unknown → 500; `json(data, status=200)`.

**Interfaces:**
- Produces (lib): `createStore(db, name, countPw, adminPw): { storeId, code }` (code retry on UNIQUE collision); `joinStore(db, code, password, counterName): { token, role, storeId, storeName }` (admin pw checked first, then count pw; counter requires nonempty counterName; wrong pw → ApiError 401 "Kod veya şifre hatalı"); `createSession(db, storeId, name): { id }` (closes other active sessions first — one active session per store); `listSessions(db, storeId): { id, name, status, createdAt }[]`; `closeSession(db, storeId, sessionId): void`
- Produces (HTTP): `POST /api/store {name, countPassword, adminPassword}` → `{code, token}` (admin token); `POST /api/store/join {code, password, counterName?}` → `{token, role, storeName, storeId}`; `GET /api/sessions` (auth) → `{sessions}`; `POST /api/sessions {name}` (admin) → `{id}`; `PATCH /api/sessions {id, status:"closed"}` (admin).

- [ ] Step 1: Failing lib tests: `test_create_and_join_counter`, `test_join_admin_role`, `test_wrong_password_401`, `test_one_active_session` (create 2nd session → 1st becomes closed), `test_store_isolation` (join with other store's code+pw fails).
- [ ] Step 2: FAIL → implement lib + routes (routes thin: parse body, call lib with `getDb()`). Step 3: PASS, `./node_modules/.bin/tsc --noEmit` clean. Step 4: Commit `feat: magaza olusturma/giris + oturumlar API`.

### Task 4: Catalog lib + API

**Files:**
- Create: `lib/server/catalog.ts`, `tests/server/catalog.test.ts`, `app/api/catalog/route.ts`

**Interfaces:**
- Produces (lib): `type CatalogItem = { barcode: string; name: string; category: string | null; expected: number | null }`; `replaceCatalog(db, storeId, items: CatalogItem[]): { count, version }` (single transaction: DELETE store rows + prepared INSERT; bump catalog_version); `getCatalog(db, storeId, since?: number): { version: number; unchanged?: true; items?: CatalogItem[] }`; `catalogSize(db, storeId): number`
- Produces (HTTP): `PUT /api/catalog {items}` (admin) → `{count, version}`; `GET /api/catalog?since=N` (auth) → unchanged or full list.

- [ ] Step 1: Failing tests: `test_replace_and_get`, `test_since_unchanged`, `test_catalog_turkish_names` (name `"Şeftali Yoğurt İçeceği ğüşı"` roundtrips byte-exact), `test_leading_zero_barcode` (`"0012345"` stays string), `test_bulk_20k_under_3s` (20k rows, assert elapsed < 3000ms).
- [ ] Step 2: FAIL → implement (transaction via `db.exec("BEGIN")/("COMMIT")` with try/ROLLBACK). Step 3: PASS + tsc clean. Step 4: Commit `feat: katalog yukleme/indirme API (surumlu)`.

### Task 5: Scan events + aggregates lib + API

**Files:**
- Create: `lib/server/counts.ts`, `tests/server/counts.test.ts`, `app/api/scan/route.ts`, `app/api/my-counts/route.ts`, `app/api/dashboard/route.ts`, `app/api/dashboard/export/route.ts`

**Interfaces:**
- Produces (lib): `type ScanEvent = { id: string; sessionId: string; barcode: string; qty: number; createdAt: number }`; `recordEvents(db, storeId, counter: string, events: ScanEvent[]): { accepted: number }` (INSERT OR IGNORE, single transaction, validates session belongs to store & active); `myCounts(db, storeId, sessionId, counter): { barcode, qty }[]` (SUM>0 only); `dashboard(db, storeId, sessionId, opts: { filter: "problems" | "all"; search?: string; category?: string; page: number; pageSize: number }): { totals: { totalQty, distinctCounted, counters, unknownCount, catalogCount }, byCounter: { counter, qty, distinct, lastAt }[], byCategory: { category: string|null, counted, expected, distinct }[], rows: { barcode, name: string|null, category: string|null, expected: number|null, counted: number, status: "match"|"difference"|"only-stock"|"only-count" }[], rowTotal: number }` — rows from `products FULL-equivalent LEFT JOIN both ways via UNION`, status computed in SQL/JS; "problems" filter = status != "match"; status "only-count" means unknown barcode (not in catalog).
- Produces (HTTP): `POST /api/scan {sessionId, events}` (counter|admin) → `{accepted}`; `GET /api/my-counts?sessionId=` → `{items}`; `GET /api/dashboard?sessionId=&filter=&search=&page=` (admin) → dashboard result; `GET /api/dashboard/export?sessionId=&page=&pageSize=10000` (admin) → `{rows, rowTotal}` (filter "all").

- [ ] Step 1: Failing tests: `test_recordEvents_idempotent` (same batch twice → totals unchanged, accepted 0 second time), `test_merge_two_counters_same_barcode` (3 + 4 → counted 7, byCounter has both), `test_negative_delta_delete` (5 then -5 → excluded from myCounts, counted 0 → status "only-stock"), `test_unknown_barcode_status_only_count`, `test_dashboard_problems_filter_and_search`, `test_closed_session_rejects_events` (ApiError 409), `test_pagination` (rowTotal vs rows.length).
- [ ] Step 2: FAIL → implement. Step 3: PASS + tsc. Step 4: Commit `feat: olay tabanli sayim + pano agregasyonlari`.

### Task 6: Client offline core (IndexedDB queue + catalog cache + API wrapper)

**Files:**
- Create: `lib/store-client/session.ts`, `lib/store-client/api.ts`, `lib/store-client/idb.ts`, `lib/store-client/offline.ts`

**Interfaces:**
- `session.ts`: `type StoreAuth = { token, role, storeId, storeName, counter, code }`; `loadAuth(): StoreAuth | null`; `saveAuth(a)`; `clearAuth()` (localStorage key `magazaAuth`).
- `api.ts`: typed fetchers for every Task 3–5 endpoint, auto `Authorization: Bearer`, on 401 → throws `AuthExpiredError`; all throw `Error(turkishMessage)` on non-OK.
- `idb.ts`: `openIdb(storeId): Promise<IDBDatabase>` (db name `magaza_${storeId}`, stores: `catalog` key `barcode`, `queue` key `id`, `mine` key `${sessionId}|${barcode}`, `meta` key `key`); tiny promise helpers `idbGetAll`, `idbBulkPut` (chunked 2000), `idbPut`, `idbDelete`, `idbClear`.
- `offline.ts`: `ensureCatalog(auth, onProgress?): Promise<Map<string, { name, expected }>>` (GET since cached version, bulk-put, build Map); `enqueueScan(storeId, ev: ScanEvent & { counter }): Promise<void>` (also updates `mine` aggregate); `getMine(storeId, sessionId): Promise<{ barcode, qty }[]>`; `seedMine(storeId, sessionId, items)`; `startSync(auth, sessionId, cb: (s: SyncState) => void): () => void` — interval 4s + `online` + `visibilitychange`; drains queue in batches of 500 via POST /api/scan, deletes acked ids; `type SyncState = { pending: number; lastOkAt: number | null; online: boolean; authExpired?: boolean }` (on AuthExpiredError: stop draining, keep queue, set flag).

- [ ] Step 1: Implement all four modules (browser-only; no unit tests — verified by tsc now, browser smoke in Task 12).
- [ ] Step 2: `tsc --noEmit` clean. Step 3: Commit `feat: istemci offline cekirdegi (IndexedDB kuyruk + katalog onbellek)`.

### Task 7: Camera scanner component

**Files:**
- Create: `components/camera-scanner.tsx`
- Reference (do not modify): camera effect in `app/page.tsx` (Html5Qrcode constructor config with formatsToSupport + BarcodeDetector flag, fps 15, qrbox 85%/50% function, videoConstraints 1920x1080 environment; cleanup `stop().catch().finally(clearSafely)` in try/catch).

**Interfaces:**
- Produces: `<CameraScanner open onClose(): void onDetected(code: string): void continuous?: boolean />` — fullscreen overlay matching solo mode's look; `continuous` keeps scanning with 1.5s same-code cooldown (quick mode), otherwise closes after first hit. Also export `pickPhotoAndDecode(file: File): Promise<string | null>` is NOT needed — photo path reuses existing `lib/barcode-image.ts` `decodeBarcodeFromImage` directly from pages.

- [ ] Step 1: Implement by porting the proven effect verbatim into the component (same config values).
- [ ] Step 2: tsc clean. Step 3: Commit `feat: yeniden kullanilabilir kamera tarayici bileseni`.

### Task 8: Catalog file parsing (client)

**Files:**
- Create: `lib/store-client/parse-catalog.ts`, `tests/client/parse-catalog.test.ts`

**Interfaces:**
- Produces: `sheetToRows(file: File): Promise<{ headers: string[]; rows: unknown[][] }>` (xlsx dynamic import, `{raw: true}`); `detectColumns(headers: string[]): { barcode: number; name: number; category: number | -1; expected: number | -1 }` (match lowercased: barkod/barcode/kod → barcode; ad/ürün/urun/name/açıklama → name; kategori/category/grup/reyon/bölüm → category; stok/adet/miktar/expected/beklenen → expected); `buildCatalog(rows: unknown[][], cols): { items: CatalogItem[]; errors: string[] }` — barcode: string cells trimmed, number cells `String(v)` only if `Number.isSafeInteger(v)`, else row error `"satır N: barkod bilimsel gösterimde"`; skips empty barcode rows; dedupes (last wins).
- `detectColumns`/`buildCatalog` are pure (testable in node); only `sheetToRows` touches File.

- [ ] Step 1: Failing tests: `test_detect_turkish_headers` (`["Barkod","Ürün Adı","Stok"]`), `test_numeric_barcode_safe_integer` (8690123456789 → `"8690123456789"`), `test_scientific_rejected` (8.69e12 as non-safe-float → error row), `test_dedupe_last_wins`, `test_expected_optional`.
- [ ] Step 2: FAIL → implement → PASS + tsc. Step 3: Commit `feat: katalog dosyasi ayristirma (guvenli barkod donusumu)`.

### Task 9: Join/create page `/magaza`

**Files:**
- Create: `app/magaza/page.tsx`
- Modify: `app/page.tsx` (header: one `Link` button "Mağaza Modu" with Store icon next to theme toggle)

**Interfaces:**
- Consumes: `api.ts` createStore/join, `session.ts`.
- Two tabs (existing Tabs component): "Giriş" (kod, şifre, ad — ad alanı yalnız sayım şifresiyle gerekli; hint: "Yönetici şifresiyle girersen panoya gidersin") and "Mağaza Kur" (ad, sayım şifresi, yönetici şifresi ×2 doğrulama). On success saveAuth + router.push: counter → `/magaza/sayim`, admin → `/magaza/panel`. If loadAuth() already set, show "Devam et: {storeName} ({counter|yönetici})" card + "Çıkış yap". Created store shows big copyable code with uyarı "Bu kodu sayımcılara ver".

- [ ] Step 1: Implement page (compact style matching redesign: Card, h-11 inputs, indigo primary).
- [ ] Step 2: tsc + `pnpm build` clean. Step 3: Commit `feat: magaza giris/kurulum sayfasi`.

### Task 10: Counting page `/magaza/sayim`

**Files:**
- Create: `app/magaza/sayim/page.tsx`

**Interfaces:**
- Consumes: offline.ts (ensureCatalog, enqueueScan, getMine, seedMine, startSync), CameraScanner, decodeBarcodeFromImage, session.ts, api.ts (myCounts for seed).
- Behavior: guard → no auth → redirect `/magaza`. Header: storeName + counter + sync badge (`Çevrimdışı — N bekliyor` amber / `Senkron` green / `Oturum süresi doldu — tekrar gir` red link). Loads catalog with progress ("Katalog indiriliyor… %"), loads active session (`GET /api/sessions` → active; none → "Yönetici henüz sayım başlatmadı" empty state with refresh button; offline → last known sessionId from idb meta).
- Scan input identical pattern to solo mode (autofocus, enter submits, camera + photo buttons, quick-mode toggle with qty chips). On submit: lookup Map → **product card flashes under input: name + kategori rozeti (or "⚠ Listede yok" amber) + new total**; qty dialog same as solo (1/5/10/20 + custom) in normal mode, instant add in quick mode. Every add → `enqueueScan` with uuid + updates own list state.
- Own list table (solo table style): barcode, name from Map, qty, unknown badge, delete (→ negative delta event) — sorted last-scanned first, only own items, searchable.

- [ ] Step 1: Implement. Step 2: tsc + build clean. Step 3: Commit `feat: cok kullanicili sayim ekrani (offline-first)`.

### Task 11: Admin dashboard `/magaza/panel`

**Files:**
- Create: `app/magaza/panel/page.tsx`, `components/catalog-upload.tsx`

**Interfaces:**
- Consumes: api.ts dashboard/export/sessions/catalog, parse-catalog.ts, lib/export.ts (`downloadCompareXLSX/CSV`, `printComparePDF`, `shareCompare` with `CompareRow[]`).
- Guard: role !== "admin" → redirect `/magaza`. Sections:
  1. Oturum bar: active session name + "Yeni Sayım Başlat" (dialog, closes previous) + "Sayımı Bitir" (AlertDialog confirm).
  2. CatalogUpload card: file input → sheetToRows → column dropdowns (auto-preselected) + first-3-rows preview → "Yükle (N ürün)" → PUT, progress state, errors listed (max 10 + "… ve X daha"); shows current `catalogCount` + version.
  3. Canlı özet: stat chips (toplam adet, sayılan farklı barkod / katalog, sayımcı sayısı, listede yok) — poll 5s while tab visible.
  4. Sayımcılar table: counter, qty, distinct, son okutma (relative time).
  5. Kategori kırılımı table (byCategory: kategori, sayılan, beklenen, fark) — shown only when catalog has categories.
  6. Karşılaştırma table: filter toggle (Sorunlular | Tümü) + kategori dropdown filter, search input, paginated 100, status badges reusing solo-mode soft badge styles; "Listede yok" rows amber; kategori column when present.
  7. Dışa aktar dropdown (XLSX/CSV/PDF/Paylaş): loops `/api/dashboard/export` pages → new export fns in lib/export.ts with columns Barkod, Ürün Adı, Kategori, Beklenen, Sayılan, Fark, Durum (store-mode variants; solo compare fns untouched).
- [ ] Step 1: Implement. Step 2: tsc + build. Step 3: Commit `feat: canli yonetici panosu (yukleme, kirilim, karsilastirma, disa aktarma)`.

### Task 12: Service worker + end-to-end smoke

**Files:**
- Create: `public/sw.js`, `components/sw-register.tsx`
- Modify: `app/layout.tsx` (mount `<SwRegister />`)

**Interfaces:**
- `sw.js`: cache name versioned `stok-v1`; install: skipWaiting; activate: clean old caches + clients.claim; fetch: same-origin only — `/_next/static/` & `/icons` cache-first; navigations network-first with cache fallback (cache successful navigations); never cache `/api/`.
- `SwRegister`: registers `/sw.js` only when `process.env.NODE_ENV === "production"` and `"serviceWorker" in navigator`.

- [ ] Step 1: Implement both.
- [ ] Step 2: `pnpm build` + `pnpm start` (port 3458) → browser smoke: create store → upload small CSV catalog (5 rows incl. Turkish name) → open counter in 2nd tab → scan known + unknown barcode → panel shows merged totals, unknown flagged, per-counter row → counter tab: DevTools offline → scan 2 more → back online → panel reflects them. Export XLSX toast OK.
- [ ] Step 3: Fix whatever the smoke run surfaces; re-run until clean. Commit `feat: service worker + uctan uca dogrulama duzeltmeleri`.

### Task 13: Deployment package (Ubuntu + gizli repo + Cloudflare)

**Files:**
- Create: `scripts/kurulum.sh`, `scripts/guncelle.sh`, `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `DEPLOY.md`
- Modify: `README.md` (kısa Mağaza Modu bölümü + DEPLOY.md linki)

**Interfaces:**
- `scripts/kurulum.sh` (Ubuntu, root/sudo, idempotent): apt update; NodeSource Node 24; corepack pnpm; `pnpm install --frozen-lockfile`; `pnpm build`; `data/` oluştur; systemd unit `stok-sayim.service` yaz+enable+start (User=mevcut kullanıcı, WorkingDirectory=repo, `Environment=DATA_DIR=.../data PORT=3000`, ExecStart=`pnpm start`, Restart=always); Caddy kur (apt, resmi repo) ve alan adı parametresi verildiyse `Caddyfile` yazıp reload (`alan.com { reverse_proxy localhost:3000 }`); her adımda `echo "[adım] ..."` ilerleme çıktısı; alan adı `./scripts/kurulum.sh stok.example.com` argümanıyla.
- `scripts/guncelle.sh`: `git pull --ff-only` + `pnpm install --frozen-lockfile` + `pnpm build` + `sudo systemctl restart stok-sayim` + durum çıktısı.
- Dockerfile: `FROM node:24-alpine`, corepack pnpm, install+build, `ENV DATA_DIR=/app/data`, `VOLUME /app/data`, `EXPOSE 3000`, `CMD ["pnpm","start"]`; compose: port 3000, `./data:/app/data`, `restart: unless-stopped`.
- DEPLOY.md (Türkçe, adım adım, kopyala-yapıştır komutlarla): 1) sunucuya SSH; 2) gizli repo için deploy key üretme (`ssh-keygen`), GitHub repo Settings → Deploy keys'e ekleme, `git clone git@github.com:...`; 3) `sudo bash scripts/kurulum.sh alan.adi.com`; 4) Cloudflare'de A kaydı (sunucu IP, proxy açık) + SSL/TLS "Full (strict)" notu + Caddy'nin otomatik sertifika alması; alan adı yoksa `http://sunucu-ip:3000` ile kullanım; 5) güncelleme `bash scripts/guncelle.sh`; 6) yedekleme = `data/` klasörünü kopyala (cron örneği); 7) servis komutları (status/logs: `journalctl -u stok-sayim -f`); 8) Docker alternatifi; 9) "7 GB / 4 CPU yeter mi" → evet notu.

- [ ] Step 1: Write all files (`bash -n` ile sözdizimi kontrolü). Step 2: `pnpm build` + `pnpm test` + tsc son kontrol. Step 3: Commit `feat: ubuntu kurulum scriptleri + DEPLOY.md (Cloudflare, guncelleme)` + push.
