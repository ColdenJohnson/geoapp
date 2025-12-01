#!/bin/sh
set -euo pipefail

echo "🔧 [CI] Installing JS dependencies..."

if [ -f yarn.lock ]; then
  echo "Using yarn..."
  yarn install --frozen-lockfile
elif [ -f package-lock.json ]; then
  echo "Using npm ci..."
  npm ci
else
  echo "No lockfile found; running npm install (less reproducible)."
  npm install
fi

echo "📦 [CI] Installing CocoaPods dependencies..."
cd ios
pod install

echo "✅ [CI] Dependencies ready for Xcode build."