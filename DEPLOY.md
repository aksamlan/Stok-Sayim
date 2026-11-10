# Stokzen Stok Sayım — Kendi Sunucuna Kurulum (Ubuntu)

Bu rehber, uygulamayı **kendi Ubuntu sunucuna** (7 GB RAM / 4 CPU fazlasıyla yeter)
adım adım kurmanı sağlar. Tüm komutlar kopyala-yapıştır içindir.

> Özet: deploy key ile klonla → `sudo bash scripts/kurulum.sh alan.adi.com` →
> `node scripts/yonetici-sifre.mjs <şifre>` → bitti.

---

## 1. Sunucuya bağlan

```bash
ssh kullanici@SUNUCU-IP
```

## 2. Gizli repoyu klonla (deploy key ile)

Repo gizli olduğu için sunucuya **sadece okuma** yetkili bir deploy key ekleyeceğiz.

Sunucuda anahtar üret:

```bash
ssh-keygen -t ed25519 -C "stok-sunucu" -f ~/.ssh/stok_deploy -N ""
cat ~/.ssh/stok_deploy.pub
```

Çıkan `ssh-ed25519 ...` satırını kopyala → GitHub'da repoya git →
**Settings → Deploy keys → Add deploy key** → yapıştır (Write access'e GEREK YOK) → kaydet.

Sonra sunucuda:

```bash
cat >> ~/.ssh/config <<'EOF'
Host github.com-stok
  HostName github.com
  IdentityFile ~/.ssh/stok_deploy
EOF

git clone git@github.com-stok:aksamlan/Stok-Sayim.git ~/stok-sayim
cd ~/stok-sayim
```

## 3. Kurulum scriptini çalıştır

**Alan adıyla** (önerilen — otomatik HTTPS dahil):

```bash
sudo bash scripts/kurulum.sh stok.alanadin.com
```

**Alan adsız** (sadece IP ile kullanacaksan):

```bash
sudo bash scripts/kurulum.sh
```

Script sırasıyla şunları yapar: Node 24 + pnpm kurar, bağımlılıkları indirir,
uygulamayı derler, `data/` klasörünü oluşturur, `stok-sayim` adlı systemd
servisini kurup başlatır (sunucu yeniden başlasa bile uygulama otomatik açılır)
ve alan adı verdiysen Caddy reverse proxy + otomatik HTTPS kurar.

## 4. Platform yöneticisi (/yonetim) şifresini belirle

```bash
cd ~/stok-sayim
node scripts/yonetici-sifre.mjs COK-GIZLI-SIFRE
```

Bu şifreyle `https://alan.adi.com/yonetim` paneline girersin: tüm mağazaları,
kim ne saymış görürsün; şifresini unutan mağazaya yeni şifre verirsin.
Şifreyi unutursan aynı komutu tekrar çalıştırman yeter (sadece sunucudan değişir).

## 5. Alan adını Cloudflare'e bağla

1. Cloudflare → alan adın → **DNS** → **Add record**:
   - Type: `A`, Name: `stok` (veya istediğin alt alan), IPv4: `SUNUCU-IP`
   - Proxy: **açık** (turuncu bulut) olabilir.
2. Cloudflare → **SSL/TLS** → mod: **Full (strict)**.
   (Caddy sunucuda gerçek sertifika aldığı için Full (strict) sorunsuz çalışır.)
3. 1-2 dakika içinde `https://stok.alanadin.com` açılır.

> Not: Proxy açıkken Caddy'nin ilk sertifika alması için kuruluma başlamadan
> DNS kaydını eklemiş olman iyi olur. Sertifika alınamazsa bulutu geçici olarak
> gri yapıp `sudo systemctl restart caddy` de, sonra tekrar turuncuya al.

## 6. Güncelleme (yeni sürüm çıktığında)

```bash
cd ~/stok-sayim
bash scripts/guncelle.sh
```

Kod çekilir, derlenir, servis yeniden başlar. **Veriler silinmez** — her şey
`data/` klasöründedir.

## 7. Yedekleme

Tüm veri tek klasörde: `~/stok-sayim/data/`. Yedek = bu klasörü kopyalamak.

Günlük otomatik yedek için:

```bash
crontab -e
# şu satırı ekle (her gece 03:00'te yedekler, son 14 günü tutar):
0 3 * * * tar czf $HOME/yedek-stok-$(date +\%F).tar.gz -C $HOME/stok-sayim data && ls -t $HOME/yedek-stok-*.tar.gz | tail -n +15 | xargs -r rm
```

## 8. Servis komutları

```bash
systemctl status stok-sayim      # durum
journalctl -u stok-sayim -f      # canlı log
sudo systemctl restart stok-sayim
```

## Alternatif: Docker ile

Sunucuda Docker varsa script yerine şunu da kullanabilirsin:

```bash
cd ~/stok-sayim
docker compose up -d --build
# güncelleme: git pull && docker compose up -d --build
```

Veriler yine `./data` klasöründe kalır. Alan adı için önüne Caddy/Nginx koy.

## Sık sorulanlar

- **7 GB / 4 CPU yeter mi?** Evet, fazlasıyla. 100.000 ürünlük katalog + 10
  eş zamanlı sayımcı bu makinede rahat çalışır (SQLite + tek Node süreci).
- **İnternet kesilirse?** Sayımcıların telefonları çevrimdışı saymaya devam
  eder; bağlantı gelince otomatik senkronlanır. Sunucunun kapalı kalması da
  veri kaybettirmez.
- **Node sürümü?** En az Node 24 gerekir (`node:sqlite` için). Script bunu
  kendisi kurar.
