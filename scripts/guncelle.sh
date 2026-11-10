#!/usr/bin/env bash
# Stokzen Stok Sayım — tek komutla güncelleme
# Kullanım: bash scripts/guncelle.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
cd "$REPO_DIR"

echo "==> Kod çekiliyor (git pull)"
git pull --ff-only

echo "==> Bağımlılıklar güncelleniyor"
corepack pnpm install --frozen-lockfile

echo "==> Derleniyor"
corepack pnpm build

echo "==> Servis yeniden başlatılıyor"
sudo systemctl restart stok-sayim
sleep 2
systemctl --no-pager status stok-sayim | head -6 || true

echo "==> GÜNCELLEME TAMAM ✔ (veriler data/ içinde korunur)"
