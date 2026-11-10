# Stokzen Stok Sayım — Kendi Sunucuna Kurulum (Ubuntu)

Bu rehber, uygulamayı **kendi Ubuntu sunucuna** (7 GB RAM / 4 CPU fazlasıyla yeter)
adım adım kurmanı sağlar. Tüm komutlar kopyala-yapıştır içindir.

> Özet: deploy key ile klonla → `sudo bash scripts/kurulum.sh` → menüden **1**
> seç → script her şeyi sorar ve kurar. Bitti.

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

## 3. Yönetim scriptini aç — her şey menüden

```bash
cd ~/stok-sayim
sudo bash scripts/kurulum.sh
```

Karşına menü çıkar:

```
  1) Kurulum        (Node + build + servis; alan adı ve şifre sorulur)
  2) Güncelle       (git pull + build + migrasyon + servis restart)
  3) Alan adı bağla / değiştir (Caddy, otomatik HTTPS)
  4) /yonetim şifresi belirle / sıfırla
  5) Durum ve loglar
  6) Servisi yeniden başlat
  7) Yedek al (data/ klasörü)
  0) Çıkış
```

İlk kurulumda **1**'i seç: script Node 24 + pnpm kurar, uygulamayı derler,
`stok-sayim` systemd servisini kurup başlatır (sunucu yeniden başlasa bile
uygulama otomatik açılır), sonra sana sırayla sorar:

- **Alan adı** (örn. `stok.alanadin.com`) — yazarsan Caddy + otomatik HTTPS
  kurulur; boş geçersen `http://SUNUCU-IP:3000` ile kullanırsın.
- **/yonetim şifresi** — platform yönetim panelinin şifresi. Bu şifreyle
  `/yonetim` paneline girersin: tüm mağazaları, kim ne saymış görürsün;
  şifresini unutan mağazaya yeni şifre verirsin.

Şifreyi sonradan değiştirmek/sıfırlamak için yine menüden **4**'ü seçmen
yeterli (sadece sunucudan değiştirilebilir — güvenlik böyle sağlanıyor).

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

Menüden **2**'yi seç — ya da kısayol:

```bash
cd ~/stok-sayim
bash scripts/guncelle.sh
```

Kod çekilir, derlenir, varsa veritabanı migrasyonları servis açılışında
otomatik uygulanır, servis yeniden başlar. **Veriler silinmez** — her şey
`data/` klasöründedir.

## 7. Yedekleme

Menüden **7** anında yedek alır (`~/stok-yedek-TARIH.tar.gz`). Tüm veri tek
klasörde: `~/stok-sayim/data/` — yedek = bu klasörü kopyalamak.

Günlük otomatik yedek için:

```bash
crontab -e
# şu satırı ekle (her gece 03:00'te yedekler, son 14 günü tutar):
0 3 * * * tar czf $HOME/yedek-stok-$(date +\%F).tar.gz -C $HOME/stok-sayim data && ls -t $HOME/yedek-stok-*.tar.gz | tail -n +15 | xargs -r rm
```

## 8. Servis durumu ve loglar

Menüden **5** durumu ve son logları gösterir, **6** servisi yeniden başlatır.
Elle bakmak istersen:

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
