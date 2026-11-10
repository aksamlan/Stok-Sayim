#!/usr/bin/env bash
# Kısayol: bash scripts/guncelle.sh  ==  kurulum.sh menüsündeki "2) Güncelle"
exec bash "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/kurulum.sh" guncelle
