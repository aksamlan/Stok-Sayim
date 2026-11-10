#!/usr/bin/env bash
# Stokzen Stok Sayım — Ubuntu kurulum scripti
# Kullanım:
#   sudo bash scripts/kurulum.sh              -> alan adsız (http://sunucu-ip:3000)
#   sudo bash scripts/kurulum.sh stok.ornek.com -> Caddy ile alan adı + otomatik HTTPS
set -euo pipefail

DOMAIN="${1:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

adim() { echo; echo "==> $1"; }

if [ "$(id -u)" != "0" ]; then
  echo "Bu scripti sudo ile çalıştır: sudo bash scripts/kurulum.sh [alan-adi]"
  exit 1
fi

RUN_USER="${SUDO_USER:-root}"

adim "Sistem paketleri güncelleniyor"
apt-get update -y
apt-get install -y curl ca-certificates gnupg git

adim "Node.js 24 kontrol ediliyor"
NEED_NODE=1
if command -v node >/dev/null 2>&1; then
  MAJOR="$(node -v | sed 's/v\([0-9]*\).*/\1/')"
  if [ "$MAJOR" -ge 24 ]; then NEED_NODE=0; fi
fi
if [ "$NEED_NODE" = "1" ]; then
  echo "Node.js 24 kuruluyor (NodeSource)..."
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi
echo "Node sürümü: $(node -v)"

adim "pnpm etkinleştiriliyor (corepack)"
corepack enable
corepack prepare pnpm@8.15.0 --activate

adim "Bağımlılıklar kuruluyor"
cd "$REPO_DIR"
sudo -u "$RUN_USER" -H corepack pnpm install --frozen-lockfile

adim "Uygulama derleniyor (pnpm build)"
sudo -u "$RUN_USER" -H corepack pnpm build

adim "Veri klasörü hazırlanıyor"
mkdir -p "$REPO_DIR/data"
chown -R "$RUN_USER":"$RUN_USER" "$REPO_DIR/data"

adim "systemd servisi yazılıyor (stok-sayim.service)"
PNPM_BIN="$(command -v pnpm || true)"
if [ -z "$PNPM_BIN" ]; then PNPM_BIN="/usr/bin/corepack pnpm"; fi
cat > /etc/systemd/system/stok-sayim.service <<SERVICE
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
ExecStart=$PNPM_BIN start
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
SERVICE
systemctl daemon-reload
systemctl enable --now stok-sayim
sleep 2
systemctl --no-pager --full status stok-sayim | head -8 || true

if [ -n "$DOMAIN" ]; then
  adim "Caddy kuruluyor (alan adı: $DOMAIN, otomatik HTTPS)"
  if ! command -v caddy >/dev/null 2>&1; then
    apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
      | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
      > /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -y
    apt-get install -y caddy
  fi
  cat > /etc/caddy/Caddyfile <<CADDY
$DOMAIN {
	reverse_proxy localhost:3000
}
CADDY
  systemctl reload caddy || systemctl restart caddy
  echo "Caddy hazır: https://$DOMAIN (DNS'in bu sunucuya yönlendiğinden emin ol)"
fi

adim "KURULUM TAMAM ✔"
echo "- Uygulama:      http://$(hostname -I 2>/dev/null | awk '{print $1}'):3000"
if [ -n "$DOMAIN" ]; then echo "- Alan adı:      https://$DOMAIN"; fi
echo "- Servis durumu: systemctl status stok-sayim"
echo "- Loglar:        journalctl -u stok-sayim -f"
echo
echo "ŞİMDİ YAPILACAK: /yonetim paneli şifresini belirle:"
echo "  cd $REPO_DIR && node scripts/yonetici-sifre.mjs <gizli-sifre>"
