#!/usr/bin/env bash
# ============================================================
#  Stokzen Stok Sayım — Sunucu Yönetim Scripti (Ubuntu)
#  Kullanım:  sudo bash scripts/kurulum.sh
#  Her şey menüden: kurulum, güncelleme, alan adı, SMTP,
#  /yonetim şifresi, durum/log, yedek. Komut ezberi yok.
# ============================================================
set -uo pipefail
# Not: set -e bilinçli olarak YOK — menü akışında her adım açıkça denetlenir
# (bash, `fn || true` çağrılarında -e'yi zaten devre dışı bırakır; ona
# güvenmek sessiz yarım-kurulumlara yol açar).

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
RUN_USER="${SUDO_USER:-$(whoami)}"
SERVICE="stok-sayim"
ENV_FILE="/etc/stok-sayim.env"

adim()   { echo; echo "==> $1"; }
hata()   { echo "HATA: $1" >&2; }
basari() { echo; echo "✔ $1"; }

# Kritik adım: başarısız olursa nedenini yazar ve 1 döner.
zorunlu() {
  "$@" && return 0
  hata "Adım başarısız oldu: $*"
  return 1
}

root_gerek() {
  if [ "$(id -u)" != "0" ]; then
    hata "Bu işlem için script'i sudo ile başlat: sudo bash scripts/kurulum.sh"
    return 1
  fi
}

kullanici_olarak() { # repo kullanıcısı olarak komut çalıştır (bash -c YOK: enjeksiyon riski)
  if [ "$(id -u)" = "0" ] && [ "$RUN_USER" != "root" ]; then
    sudo -u "$RUN_USER" -H env "PATH=$PATH" "$@"
  else
    "$@"
  fi
}

env_dosyasi_hazirla() {
  [ -f "$ENV_FILE" ] || { touch "$ENV_FILE"; chmod 600 "$ENV_FILE"; }
}

env_ayarla() { # env_ayarla ANAHTAR değer  → ENV_FILE içinde ekler/değiştirir
  env_dosyasi_hazirla
  local key="$1" value="$2" old_umask
  old_umask="$(umask)"
  umask 077  # geçici dosya da dahil hiçbir an dünya-okunur olmasın (SMTP şifresi!)
  grep -v "^${key}=" "$ENV_FILE" > "${ENV_FILE}.tmp" || true
  printf '%s=%s\n' "$key" "$value" >> "${ENV_FILE}.tmp"
  mv "${ENV_FILE}.tmp" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  umask "$old_umask"
}

node_kur() {
  adim "Node.js 24 kontrol ediliyor"
  local need=1
  if command -v node >/dev/null 2>&1; then
    local major
    major="$(node -v | sed 's/v\([0-9]*\).*/\1/')"
    [ "$major" -ge 24 ] && need=0
  fi
  if [ "$need" = "1" ]; then
    echo "Node.js 24 kuruluyor (NodeSource)..."
    zorunlu bash -c 'curl -fsSL https://deb.nodesource.com/setup_24.x | bash -' || return 1
    zorunlu apt-get install -y nodejs || return 1
  fi
  echo "Node sürümü: $(node -v)"
  zorunlu corepack enable || return 1
  zorunlu corepack prepare pnpm@8.15.0 --activate || return 1
}

derle() {
  adim "Bağımlılıklar kuruluyor"
  zorunlu kullanici_olarak corepack pnpm -C "$REPO_DIR" install --frozen-lockfile || return 1
  adim "Uygulama derleniyor (pnpm build)"
  zorunlu kullanici_olarak corepack pnpm -C "$REPO_DIR" build || return 1
}

servis_kur() {
  adim "systemd servisi yazılıyor ($SERVICE)"
  env_dosyasi_hazirla
  local pnpm_bin
  pnpm_bin="$(command -v pnpm || true)"
  [ -z "$pnpm_bin" ] && pnpm_bin="/usr/bin/corepack pnpm"
  # STOK_BIND_ARGS env dosyasında yaşar (örn. "-H 127.0.0.1"): servis yeniden
  # yazılsa bile bağlama ayarı KAYBOLMAZ.
  cat > "/etc/systemd/system/$SERVICE.service" <<SERVICEEOF
[Unit]
Description=Stokzen Stok Sayim
After=network.target

[Service]
Type=simple
User=$RUN_USER
WorkingDirectory=$REPO_DIR
Environment=NODE_ENV=production
Environment=DATA_DIR=$REPO_DIR/data
Environment=PORT=3000
EnvironmentFile=-$ENV_FILE
ExecStart=$pnpm_bin start \$STOK_BIND_ARGS
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
SERVICEEOF
  zorunlu systemctl daemon-reload || return 1
  zorunlu systemctl enable "$SERVICE" || return 1
  zorunlu systemctl restart "$SERVICE" || return 1
  sleep 2
  if ! systemctl is-active --quiet "$SERVICE"; then
    hata "Servis başlamadı. Log: journalctl -u $SERVICE -n 30"
    journalctl -u "$SERVICE" -n 15 --no-pager || true
    return 1
  fi
  echo "Servis çalışıyor."
}

alan_adi_bagla() {
  root_gerek || return 1
  local domain="${1:-}"
  if [ -z "$domain" ]; then
    echo
    read -r -p "Alan adı (örn. stok.alanadin.com): " domain
  fi
  if [ -z "$domain" ]; then
    hata "Alan adı boş, vazgeçildi."
    return 1
  fi
  adim "Caddy kuruluyor / ayarlanıyor ($domain, otomatik HTTPS)"
  if ! command -v caddy >/dev/null 2>&1; then
    zorunlu apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gnupg || return 1
    zorunlu bash -c "curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg" || return 1
    zorunlu bash -c "curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list" || return 1
    zorunlu apt-get update -y || return 1
    zorunlu apt-get install -y caddy || return 1
  fi
  cat > /etc/caddy/Caddyfile <<CADDYEOF
$domain {
	# 100k ürünlük katalog ~10 MB JSON'dur; sıkıştırma ile ~1.5 MB iner.
	encode zstd gzip
	reverse_proxy localhost:3000
}
CADDYEOF
  zorunlu systemctl reload caddy || zorunlu systemctl restart caddy || return 1
  adim "Uygulama yalnız 127.0.0.1'e bağlanıyor (dışarıdan sadece Caddy/HTTPS erişir)"
  env_ayarla STOK_BIND_ARGS "-H 127.0.0.1"
  echo
  read -r -p "Cloudflare proxy (turuncu bulut) kullanacak mısın? [e/H]: " cfyn
  if [ "${cfyn:-H}" = "e" ] || [ "${cfyn:-H}" = "E" ]; then
    # Hız limiti gerçek ziyaretçi IP'sini CF-Connecting-IP'den okur.
    # Güvenli olması için 80/443'ü yalnız Cloudflare IP aralıklarına açman önerilir (DEPLOY.md).
    env_ayarla TRUST_CF_HEADER "1"
    echo "Cloudflare gerçek-IP desteği açıldı (TRUST_CF_HEADER=1)."
  fi
  if [ -f "/etc/systemd/system/$SERVICE.service" ]; then
    zorunlu systemctl restart "$SERVICE" || return 1
    sleep 2
    if ! systemctl is-active --quiet "$SERVICE"; then
      hata "Servis alan adı ayarından sonra başlamadı! Log: journalctl -u $SERVICE -n 30"
      journalctl -u "$SERVICE" -n 15 --no-pager || true
      return 1
    fi
  fi
  basari "Alan adı bağlandı: https://$domain"
  echo "  Cloudflare: DNS'te A kaydı -> sunucu IP'si, SSL/TLS modu Full (strict)."
  echo "  Detay: DEPLOY.md"
}

smtp_ayarla() {
  root_gerek || return 1
  echo
  echo "E-posta (SMTP) ayarı: hoş geldin mailleri ve otomatik silme uyarıları"
  echo "için kullanılır. Sağlayıcından (ör. kendi mail sunucun, Yandex, Gmail"
  echo "uygulama şifresi vb.) SMTP bilgilerini al."
  local host port user pass from
  read -r -p "SMTP sunucusu (örn. smtp.eposta.com): " host
  [ -z "$host" ] && { hata "SMTP sunucusu boş, vazgeçildi."; return 1; }
  read -r -p "Port [587]: " port
  read -r -p "Kullanıcı adı (boşsa doğrulamasız): " user
  local pass=""
  if [ -n "$user" ]; then
    read -r -s -p "Şifre: " pass; echo
  fi
  read -r -p "Gönderen adres [${user:-stokzen@$host}]: " from
  env_ayarla SMTP_HOST "$host"
  env_ayarla SMTP_PORT "${port:-587}"
  env_ayarla SMTP_USER "$user"
  env_ayarla SMTP_PASS "$pass"
  env_ayarla SMTP_FROM "${from:-${user:-stokzen@$host}}"
  if [ -f "/etc/systemd/system/$SERVICE.service" ]; then
    zorunlu systemctl restart "$SERVICE" || return 1
  fi
  basari "SMTP kaydedildi ($ENV_FILE). Mağaza kurup e-postanın gelip gelmediğini dene."
}

yonetici_sifresi() {
  echo
  echo "/yonetim paneli şifresi belirlenecek (en az 6 karakter)."
  local p1 p2
  read -r -s -p "Yeni şifre: " p1; echo
  read -r -s -p "Tekrar:     " p2; echo
  if [ "$p1" != "$p2" ]; then hata "Şifreler birbirini tutmuyor."; return 1; fi
  if [ "${#p1}" -lt 6 ]; then hata "Şifre en az 6 karakter olmalı."; return 1; fi
  # Şifre stdin üzerinden gider: komut satırında/süreç listesinde görünmez,
  # özel karakterler (' " $ boşluk) bozulmaz.
  if printf '%s' "$p1" | kullanici_olarak env "DATA_DIR=$REPO_DIR/data" node "$SCRIPT_DIR/yonetici-sifre.mjs" -; then
    basari "/yonetim şifresi güncellendi."
  else
    hata "Şifre güncellenemedi."
    return 1
  fi
}

kurulum() {
  root_gerek || return 1
  local domain="${1:-}"
  adim "Sistem paketleri güncelleniyor"
  zorunlu apt-get update -y || return 1
  zorunlu apt-get install -y curl ca-certificates gnupg git || return 1
  node_kur || return 1
  derle || return 1
  adim "Veri klasörü hazırlanıyor"
  zorunlu mkdir -p "$REPO_DIR/data" || return 1
  zorunlu chown -R "$RUN_USER":"$RUN_USER" "$REPO_DIR/data" || return 1
  servis_kur || return 1
  if [ -z "$domain" ]; then
    echo
    read -r -p "Alan adı bağlamak ister misin? (boş geç = hayır, örn. stok.alanadin.com): " domain
  fi
  if [ -n "$domain" ]; then
    alan_adi_bagla "$domain" || hata "Alan adı bağlanamadı; menüden (3) tekrar deneyebilirsin."
  fi
  echo
  read -r -p "/yonetim paneli şifresini şimdi belirlemek ister misin? [E/h]: " cevap
  if [ "${cevap:-E}" != "h" ] && [ "${cevap:-E}" != "H" ]; then
    yonetici_sifresi || hata "Şifre belirlenemedi; menüden (5) tekrar deneyebilirsin."
  fi
  echo
  read -r -p "E-posta (SMTP) ayarlamak ister misin? [e/H]: " cevap
  if [ "${cevap:-H}" = "e" ] || [ "${cevap:-H}" = "E" ]; then
    smtp_ayarla || hata "SMTP ayarlanamadı; menüden (4) tekrar deneyebilirsin."
  fi
  basari "KURULUM TAMAM"
  echo "- Uygulama:      http://$(hostname -I 2>/dev/null | awk '{print $1}'):3000"
  [ -n "${domain:-}" ] && echo "- Alan adı:      https://$domain"
  echo "- Loglar:        journalctl -u $SERVICE -f"
}

guncelle() {
  adim "Kod çekiliyor (git pull)"
  zorunlu kullanici_olarak git -C "$REPO_DIR" pull --ff-only || return 1
  derle || return 1
  adim "Servis yeniden başlatılıyor (veritabanı migrasyonları ilk istekte otomatik uygulanır)"
  if [ "$(id -u)" = "0" ]; then
    zorunlu systemctl restart "$SERVICE" || return 1
  else
    zorunlu sudo systemctl restart "$SERVICE" || return 1
  fi
  sleep 2
  systemctl --no-pager status "$SERVICE" | head -6 || true
  basari "GÜNCELLEME TAMAM — veriler data/ içinde korunur."
}

yedek_al() {
  local hedef="$HOME/stok-yedek-$(date +%F-%H%M).tar.gz"
  adim "Tutarlı yedek alınıyor (çalışan veritabanından güvenli kopya)"
  # tar ile canlı WAL dosyasını kopyalamak bozuk yedek üretebilir; bunun yerine
  # SQLite'ın çevrimiçi yedeği (VACUUM INTO) kullanılır.
  zorunlu node "$SCRIPT_DIR/yedek.mjs" "$REPO_DIR/data/stok.db" "$REPO_DIR/data/yedek-anlik.db" || return 1
  zorunlu tar czf "$hedef" -C "$REPO_DIR/data" yedek-anlik.db || return 1
  rm -f "$REPO_DIR/data/yedek-anlik.db"
  basari "Yedek hazır: $hedef"
  echo "  Geri yükleme: servisi durdur, arşivdeki yedek-anlik.db dosyasını"
  echo "  data/stok.db olarak kopyala (stok.db-wal ve stok.db-shm dosyalarını sil), servisi başlat."
}

durum_goster() {
  adim "Servis durumu"
  systemctl --no-pager status "$SERVICE" | head -10 || true
  adim "Son 30 log satırı"
  journalctl -u "$SERVICE" -n 30 --no-pager || true
  echo
  echo "Canlı log için: journalctl -u $SERVICE -f"
}

menu() {
  while true; do
    echo
    echo "============================================"
    echo "   STOKZEN STOK SAYIM — SUNUCU YÖNETİMİ"
    echo "   Repo: $REPO_DIR"
    echo "============================================"
    echo "  1) Kurulum        (Node + build + servis; alan adı, şifre, SMTP sorulur)"
    echo "  2) Güncelle       (git pull + build + migrasyon + servis restart)"
    echo "  3) Alan adı bağla / değiştir (Caddy, otomatik HTTPS, 127.0.0.1 bağlama)"
    echo "  4) E-posta (SMTP) ayarla"
    echo "  5) /yonetim şifresi belirle / sıfırla"
    echo "  6) Durum ve loglar"
    echo "  7) Servisi yeniden başlat"
    echo "  8) Yedek al (güvenli çevrimiçi kopya)"
    echo "  0) Çıkış"
    echo
    read -r -p "Seçimin: " secim || exit 0
    case "$secim" in
      1) kurulum || hata "Kurulum tamamlanamadı (yukarıdaki hataya bak)." ;;
      2) guncelle || hata "Güncelleme tamamlanamadı (yukarıdaki hataya bak)." ;;
      3) alan_adi_bagla || true ;;
      4) smtp_ayarla || true ;;
      5) yonetici_sifresi || true ;;
      6) durum_goster ;;
      7) if root_gerek; then systemctl restart "$SERVICE" && basari "Servis yeniden başlatıldı." || hata "Başlatılamadı."; fi ;;
      8) yedek_al || true ;;
      0) echo "Görüşürüz 👋"; exit 0 ;;
      *) echo "Geçersiz seçim." ;;
    esac
  done
}

# Komut satırından direkt: kurulum | guncelle | durum | yedek | <alan-adı>
case "${1:-}" in
  kurulum)  kurulum || exit 1 ;;
  guncelle) guncelle || exit 1 ;;
  durum)    durum_goster ;;
  yedek)    yedek_al || exit 1 ;;
  "")       menu ;;
  *)        kurulum "$1" || exit 1 ;;
esac
