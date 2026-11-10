# Mağaza Modu — Çok Kullanıcılı Sayım Spec

## Hedef
Aynı mağazada ~10 kişinin aynı anda, kendi telefonlarından stok sayması; sonuçların sunucuda
otomatik birleşmesi; internet kesilse bile sayımın kesintisiz devam edip bağlantı gelince
senkronlanması. Kullanıcının kendi sunucusunda (4 CPU / 7 GB, Linux) barındırılacak.
50.000–100.000 ürünlük kataloglarda akıcı çalışmalı.

## Roller ve erişim
- **Mağaza oluşturma**: mağaza adı + sayım şifresi + yönetici şifresi → 6 haneli benzersiz
  mağaza kodu üretilir (karışmayan karakterler: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`).
- **Sayımcı girişi**: mağaza kodu + sayım şifresi + kendi adı. Sadece kendi saydıklarını görür.
- **Yönetici girişi**: mağaza kodu + yönetici şifresi. Canlı birleşik panoyu görür.
- Mağazalar birbirinden tamamen yalıtılmış; tüm sorgular token'daki store_id ile süzülür.
- Token: HMAC-SHA256 imzalı, 30 gün geçerli, `{storeId, role: "counter"|"admin", counter, exp}`.
  Gizli anahtar ilk açılışta üretilip DB `meta` tablosunda saklanır (env gerektirmez).
- Şifreler scrypt ile hash'lenir (node:crypto, ek bağımlılık yok).

## Katalog
- Yönetici panodan XLSX/CSV yükler: barkod + ürün adı + (opsiyonel) kategori + (opsiyonel)
  beklenen stok adedi. Kategori sütunu varsa ürünler kategoriye göre ayrılır: sayım
  ekranında ürün adının yanında kategorisi görünür, panoda kategori kırılımı tablosu ve
  kategori filtresi olur, dışa aktarmalara kategori sütunu eklenir.
- İstemci tarafında parse edilir (mevcut `xlsx` bağımlılığı), sütunlar başlıktan otomatik
  seçilir (barkod/barcode, ad/ürün/name, stok/adet/miktar) ve kullanıcı açılır menüden
  düzeltebilir. Barkodlar HER ZAMAN string'e çevrilir (Excel'in 13 haneli sayıları bozmasına
  karşı; bilimsel gösterim `8,69E+12` reddedilir, tam sayı hücreleri String(v) yapılır).
- Tek istekte JSON olarak gönderilir (100k satır ≈ 8 MB); sunucu tek transaction'da
  REPLACE eder ve `catalog_version`'ı artırır.
- İstemci kataloğu IndexedDB'de önbelleğe alır; açılışta `GET /api/catalog?since=<v>` ile
  sürüm kontrolü yapar, değişmediyse indirmez. Bellekte Map<barcode, {name, expected}>
  kurulur → okutma anında ürün adı gösterilir, listede olmayan barkod anında
  "Listede yok" işaretlenir (yine sayılır ama bayraklı).

## Sayım akışı
- Yönetici panodan sayım oturumu açar/kapatır ("Kasım 2026 Sayımı" gibi). Sayımcılar
  aktif oturuma sayar.
- Her okutma bir **olay**dır: `{id: client-uuid, barcode, qty(±), counter, createdAt}`.
  Birleştirme toplamsaldır: aynı barkodu iki kişi sayarsa adetler toplanır, kişi kırılımı
  korunur. Sayımcının kendi listesinde silme/düzeltme = negatif/fark olayı.
- Olaylar önce IndexedDB kuyruğuna yazılır, arka planda 4 sn'de bir + online olunca +
  sekme görünür olunca toplu POST edilir. Sunucu `INSERT OR IGNORE` (id PK) ile
  **idempotent**tir: tekrar gönderim çift sayım yaratamaz.
- Sayımcının kendi listesi tamamen yerel tutulur (IndexedDB) → internet yokken de tam
  çalışır; sayfa yenilense bile kuyruk ve liste kaybolmaz. Yeni cihazdan girişte kendi
  sayımları sunucudan bir kez çekilip yerel liste tohumlanır.
- Service worker uygulama kabuğunu önbelleğe alır: internet yokken sayfa yenilense bile
  sayım ekranı açılır (sadece production'da kayıtlı).

## Yönetici panosu
- 5 sn'de bir yenilenen canlı veriler: toplam adet, farklı barkod, sayımcı sayısı,
  listede olmayan barkod sayısı.
- Kişi kırılımı: sayımcı adı, toplam adet, farklı barkod, son okutma zamanı.
- Karşılaştırma tablosu (beklenen vs sayılan): varsayılan görünüm yalnız sorunlular
  (fark / listede yok / hiç sayılmamış), sayfalı (100'er) + barkod/ad araması. 100k satır
  asla tek seferde DOM'a basılmaz.
- Dışa aktarma: mevcut `lib/export.ts` XLSX/CSV/PDF fonksiyonları yeniden kullanılır; tam
  veri `/api/dashboard/export` üzerinden 10k'lık sayfalarla çekilir.

## Sunucu / depolama
- Next.js route handler'ları + Node 24 yerleşik `node:sqlite` (DatabaseSync, WAL modu).
  Ek native bağımlılık yok. DB dosyası `DATA_DIR` (varsayılan `./data`) altında `stok.db`.
- Şema: `stores(id, code UNIQUE, name, count_pw_hash, admin_pw_hash, catalog_version, created_at)`,
  `sessions(id, store_id, name, status, created_at)`,
  `products(store_id, barcode, name, category, expected_qty, PRIMARY KEY(store_id, barcode))`,
  `scan_events(id PK, store_id, session_id, counter, barcode, qty, created_at, received_at)`
  + indeksler `(store_id, session_id, barcode)` ve `(store_id, session_id, counter)`,
  `meta(key PK, value)`.
- Tüm toplama/karşılaştırma SQL'de (GROUP BY / LEFT JOIN), sayfalı.

## Mevcut uygulama
- Tek kişilik yerel mod (localStorage) aynen kalır; ana sayfaya "Mağaza Modu" girişi eklenir.
- Kamera/fotoğraf okutma, ana sayfadaki kanıtlanmış yapılandırmayla yeni bir
  `components/camera-scanner.tsx` bileşeni olarak store moduna taşınır (ana sayfa koduna
  dokunulmaz — regresyon riski alınmaz).

## Dağıtım (Ubuntu sunucu, gizli repo, Cloudflare)
- Hedef: kullanıcının Ubuntu sunucusuna script ile adım adım kurulum. Repo GİZLİ:
  klonlama GitHub deploy key (read-only SSH) ile anlatılır.
- `scripts/kurulum.sh`: Node 24 kurulumu (NodeSource), pnpm (corepack), bağımlılıklar,
  `next build`, `data/` dizini, systemd servisi (`stok-sayim.service`, otomatik restart),
  Caddy reverse proxy kurulumu + alan adı sorusu (Caddy otomatik HTTPS; Cloudflare
  proxy'li kullanım için notlar: SSL mode Full, orange cloud).
- `scripts/guncelle.sh`: `git pull` + `pnpm install` + `pnpm build` + servis restart,
  tek komutla güncelleme.
- `Dockerfile` + `docker-compose.yml` alternatif yol olarak kalır.
- Türkçe `DEPLOY.md`: adım adım (sunucuya bağlanma, deploy key oluşturma, klonlama,
  kurulum scripti, alan adını Cloudflare'de A kaydıyla bağlama, güncelleme, yedekleme =
  `data/` klasörünü kopyala). 4 CPU / 7 GB fazlasıyla yeter.

## Performans hedefleri
- 100k satır katalog yükleme: tek transaction, < 10 sn.
- Katalog indirme + IndexedDB önbellekleme: ilk açılışta < 15 sn, sonraki açılışlar anlık.
- Barkod → ürün adı eşlemesi bellek içi Map ile anında.
- Pano sorguları SQL agregasyonu; hiçbir uç nokta sınırsız liste döndürmez (max 10k/sayfa).

## Kapsam dışı (YAGNI)
- Gerçek websocket (5 sn polling yeter), çoklu mağaza tek token, kullanıcı hesapları/e-posta,
  ürün fotoğrafları, fiyat alanları, geçmiş sayım arşiv ekranı (oturumlar kapatılır ama
  verisi durur; dışa aktarılabilir).
