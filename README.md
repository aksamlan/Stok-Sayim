# Stokzen Stok Sayım

Barkod okutarak stok sayımı: tek başına (tarayıcıda, sunucusuz) veya **Mağaza
Modu** ile aynı anda 10+ kişi birlikte.

## Özellikler

- 📷 Kamera, fotoğraf veya elle barkod okutma (telefon uyumlu)
- 🏪 **Mağaza Modu**: mağaza kodu + şifreyle çok kişili eş zamanlı sayım,
  sonuçlar sunucuda otomatik birleşir (kişi kırılımı korunur)
- 📦 50–100k satırlık ürün kataloğu (XLSX/CSV): okutunca ürün adı + kategori
  anında görünür, listede olmayan barkod "Listede yok" diye işaretlenir
- 📡 Çevrimdışı çalışma: internet kesilse de sayım devam eder, bağlantı
  gelince otomatik senkronlanır
- 📊 Canlı yönetici panosu: toplamlar, sayımcı kırılımı, kategori kırılımı,
  beklenen/sayılan karşılaştırması, XLSX/CSV/PDF dışa aktarma
- 🛡️ `/yonetim` platform paneli: tüm mağazalar, aktivite akışı, şifre
  sıfırlama, mağaza silme

## Geliştirme

```bash
pnpm install
pnpm dev        # http://localhost:3000
pnpm test       # sunucu birim testleri (vitest)
pnpm build
```

Gereksinim: Node **24+** (sunucu tarafı yerleşik `node:sqlite` kullanır,
ek veritabanı kurulumu gerekmez). Veriler `DATA_DIR` (varsayılan `./data`)
altındaki `stok.db` dosyasındadır.

## Sunucuya kurulum

Adım adım Ubuntu kurulumu (deploy key, Cloudflare alan adı, güncelleme,
yedekleme): **[DEPLOY.md](DEPLOY.md)**

Tek script, her şey menüden:

```bash
sudo bash scripts/kurulum.sh
# 1) Kurulum  2) Güncelle  3) Alan adı  4) /yonetim şifresi
# 5) Durum/loglar  6) Servis restart  7) Yedek
```
