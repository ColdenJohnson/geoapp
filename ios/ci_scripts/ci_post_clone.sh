#!/bin/sh
set -euo pipefail

echo "===== [CI] post-clone: install Node, npm deps, and CocoaPods ====="

# Reduce Homebrew noise / time
export HOMEBREW_NO_INSTALL_CLEANUP=1
export HOMEBREW_NO_AUTO_UPDATE=1

# cd out of ios/ci_scripts into main project directory
cd ../../

# install node and cocoapods
brew install node cocoapods

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