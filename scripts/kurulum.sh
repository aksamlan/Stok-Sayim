#!/usr/bin/env bash
# ============================================================
#  Stokzen Stok Sayım — Sunucu Yönetim Scripti (Ubuntu)
#  Kullanım:  sudo bash scripts/kurulum.sh
#  Her şey menüden: kurulum, alan adı, şifre, güncelleme,
#  yedek, loglar. Ayrı komut ezberlemene gerek yok.
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
RUN_USER="${SUDO_USER:-$(whoami)}"
SERVICE="stok-sayim"

adim()  { echo; echo "==> $1"; }
hata()  { echo "HATA: $1" >&2; }
basari(){ echo; echo "✔ $1"; }

root_gerek() {
  if [ "$(id -u)" != "0" ]; then
    hata "Bu işlem için script'i sudo ile başlat: sudo bash scripts/kurulum.sh"
    return 1
  fi
}

pnpm_calistir() { # repo kullanıcısı olarak pnpm komutu çalıştır
  if [ "$(id -u)" = "0" ] && [ "$RUN_USER" != "root" ]; then
    sudo -u "$RUN_USER" -H bash -c "cd '$REPO_DIR' && corepack pnpm $*"
  else
    (cd "$REPO_DIR" && corepack pnpm "$@")
  fi
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
    curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
    apt-get install -y nodejs
  fi
  echo "Node sürümü: $(node -v)"
  corepack enable
  corepack prepare pnpm@8.15.0 --activate
}

derle() {
  adim "Bağımlılıklar kuruluyor"
  pnpm_calistir install --frozen-lockfile
  adim "Uygulama derleniyor"
  pnpm_calistir build
}

servis_kur() {
  adim "systemd servisi yazılıyor ($SERVICE)"
  local pnpm_bin
  pnpm_bin="$(command -v pnpm || true)"
  [ -z "$pnpm_bin" ] && pnpm_bin="/usr/bin/corepack pnpm"
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
ExecStart=$pnpm_bin start
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
SERVICEEOF
  systemctl daemon-reload
  systemctl enable --now "$SERVICE"
  sleep 2
  systemctl --no-pager status "$SERVICE" | head -6 || true
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
    apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gnupg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
      | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
      > /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -y
    apt-get install -y caddy
  fi
  cat > /etc/caddy/Caddyfile <<CADDYEOF
$domain {
	reverse_proxy localhost:3000
}
CADDYEOF
  systemctl reload caddy || systemctl restart caddy
  basari "Alan adı bağlandı: https://$domain"
  echo "  Cloudflare kullanıyorsan: DNS'te A kaydı -> bu sunucunun IP'si,"
  echo "  SSL/TLS modu: Full (strict). Detay: DEPLOY.md bölüm 5."
}

yonetici_sifresi() {
  echo
  echo "/yonetim paneli şifresi belirlenecek (en az 6 karakter)."
  local p1 p2
  read -r -s -p "Yeni şifre: " p1; echo
  read -r -s -p "Tekrar:     " p2; echo
  if [ "$p1" != "$p2" ]; then hata "Şifreler birbirini tutmuyor."; return 1; fi
  if [ "${#p1}" -lt 6 ]; then hata "Şifre en az 6 karakter olmalı."; return 1; fi
  if [ "$(id -u)" = "0" ] && [ "$RUN_USER" != "root" ]; then
    sudo -u "$RUN_USER" -H bash -c "cd '$REPO_DIR' && DATA_DIR='$REPO_DIR/data' node scripts/yonetici-sifre.mjs '$p1'"
  else
    (cd "$REPO_DIR" && DATA_DIR="$REPO_DIR/data" node scripts/yonetici-sifre.mjs "$p1")
  fi
  basari "/yonetim şifresi güncellendi."
}

kurulum() {
  root_gerek || return 1
  local domain="${1:-}"
  adim "Sistem paketleri güncelleniyor"
  apt-get update -y
  apt-get install -y curl ca-certificates gnupg git
  node_kur
  derle
  adim "Veri klasörü hazırlanıyor"
  mkdir -p "$REPO_DIR/data"
  chown -R "$RUN_USER":"$RUN_USER" "$REPO_DIR/data"
  servis_kur
  if [ -z "$domain" ]; then
    echo
    read -r -p "Alan adı bağlamak ister misin? (boş geç = hayır, örn. stok.alanadin.com): " domain
  fi
  if [ -n "$domain" ]; then
    alan_adi_bagla "$domain"
  fi
  echo
  read -r -p "/yonetim paneli şifresini şimdi belirlemek ister misin? [E/h]: " cevap
  if [ "${cevap:-E}" != "h" ] && [ "${cevap:-E}" != "H" ]; then
    yonetici_sifresi || true
  fi
  basari "KURULUM TAMAM"
  echo "- Uygulama:      http://$(hostname -I 2>/dev/null | awk '{print $1}'):3000"
  [ -n "${domain:-}" ] && echo "- Alan adı:      https://$domain"
  echo "- Loglar:        journalctl -u $SERVICE -f"
}

guncelle() {
  adim "Kod çekiliyor (git pull)"
  if [ "$(id -u)" = "0" ] && [ "$RUN_USER" != "root" ]; then
    sudo -u "$RUN_USER" -H bash -c "cd '$REPO_DIR' && git pull --ff-only"
  else
    (cd "$REPO_DIR" && git pull --ff-only)
  fi
  derle
  adim "Servis yeniden başlatılıyor (veritabanı migrasyonları açılışta otomatik uygulanır)"
  if [ "$(id -u)" = "0" ]; then systemctl restart "$SERVICE"; else sudo systemctl restart "$SERVICE"; fi
  sleep 2
  systemctl --no-pager status "$SERVICE" | head -6 || true
  basari "GÜNCELLEME TAMAM — veriler data/ içinde korunur."
}

yedek_al() {
  local hedef="$HOME/stok-yedek-$(date +%F-%H%M).tar.gz"
  adim "Yedek alınıyor: $hedef"
  tar czf "$hedef" -C "$REPO_DIR" data
  basari "Yedek hazır: $hedef (geri yükleme: tar xzf dosya -C $REPO_DIR)"
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
    echo "  1) Kurulum        (Node + build + servis; alan adı ve şifre sorulur)"
    echo "  2) Güncelle       (git pull + build + migrasyon + servis restart)"
    echo "  3) Alan adı bağla / değiştir (Caddy, otomatik HTTPS)"
    echo "  4) /yonetim şifresi belirle / sıfırla"
    echo "  5) Durum ve loglar"
    echo "  6) Servisi yeniden başlat"
    echo "  7) Yedek al (data/ klasörü)"
    echo "  0) Çıkış"
    echo
    read -r -p "Seçimin: " secim
    case "$secim" in
      1) kurulum || true ;;
      2) guncelle || true ;;
      3) alan_adi_bagla || true ;;
      4) yonetici_sifresi || true ;;
      5) durum_goster || true ;;
      6) root_gerek && { systemctl restart "$SERVICE"; basari "Servis yeniden başlatıldı."; } || true ;;
      7) yedek_al || true ;;
      0) echo "Görüşürüz 👋"; exit 0 ;;
      *) echo "Geçersiz seçim." ;;
    esac
  done
}

# Komut satırından direkt de çağrılabilir: kurulum | guncelle | durum | yedek
case "${1:-}" in
  kurulum)  kurulum ;;
  guncelle) guncelle ;;
  durum)    durum_goster ;;
  yedek)    yedek_al ;;
  "")       menu ;;
  *)        kurulum "$1" ;;  # sudo bash scripts/kurulum.sh alan.adi.com
esac
