#!/usr/bin/env bash
# BCS Written Interactive Tree-Notebook - macOS / Linux starter
cd "$(dirname "$0")" || exit 1

echo ""
echo "  ================================================"
echo "   BCS Written Interactive Tree-Notebook"
echo "   Starting your local server... please wait"
echo "   (Lokal server chalu hocche - ektu opekha korun)"
echo "  ================================================"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "  [!] Node.js is NOT installed."
  echo ""
  echo "      Fix: install Node.js 20+ (LTS) first -"
  echo "        macOS : brew install node   OR   https://nodejs.org"
  echo "        Linux : https://nodejs.org  (download + install)"
  echo "      Then run this file again:  ./START-MAC-LINUX.sh"
  echo ""
  exit 1
fi

node launcher.mjs
