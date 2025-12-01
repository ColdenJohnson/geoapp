#!/bin/sh
set -euo pipefail

echo "🔧 [CI] Ensuring Node and CocoaPods are installed..."

# Install Node if missing
if ! command -v node >/dev/null 2>&1; then
  echo "➡️ Installing Node via Homebrew..."
  brew install node
fi

# Install CocoaPods if missing
if ! command -v pod >/dev/null 2>&1; then
  echo "➡️ Installing CocoaPods via Homebrew..."
  brew install cocoapods
fi

echo "🔧 [CI] Installing JS dependencies (npm)..."

# Script starts in ios/ci_scripts — go to repo root
cd ../..

if [ -f package-lock.json ]; then
  echo "Using npm ci (package-lock.json found)..."
  npm ci
else
  echo "No package-lock.json found; running npm install..."
  npm install
fi

echo "📦 [CI] Installing CocoaPods dependencies..."

cd ios
pod install

echo "✅ [CI] Dependencies ready for Xcode build."