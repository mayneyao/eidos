#!/bin/bash

# Graft Extension Download Script
# Downloads pre-built Graft SQLite extensions from GitHub Release
# Usage: ./scripts/download-graft.sh

set -e  # Exit on error

RELEASE_VERSION="v0.2.1"
RELEASE_URL="https://github.com/orbitinghail/graft/releases/download/${RELEASE_VERSION}"

echo "📦 Downloading Graft SQLite Extension ${RELEASE_VERSION}"
echo "================================================"

cd "$(dirname "$0")/.."  # Go to capture/ directory

# Create directories
echo "Creating directories..."
mkdir -p assets/extensions/android/{arm64-v8a,x86_64}
mkdir -p assets/extensions/ios

# Download Android extensions (from Linux builds)
echo ""
echo "📱 Downloading Android extensions..."

echo "  → arm64-v8a (required)"
curl -L --progress-bar -o /tmp/libgraft-linux-aarch64.tar.gz \
  "${RELEASE_URL}/libgraft-ext-linux-aarch64.tar.gz"

# Extract and find the .so file
mkdir -p /tmp/graft-aarch64
tar -xzf /tmp/libgraft-linux-aarch64.tar.gz -C /tmp/graft-aarch64

# Find the .so file (might be in a subdirectory)
SO_FILE=$(find /tmp/graft-aarch64 -name "*.so" -type f | head -n 1)
if [ -z "$SO_FILE" ]; then
  echo "Error: No .so file found in archive"
  ls -la /tmp/graft-aarch64
  exit 1
fi

mv "$SO_FILE" assets/extensions/android/arm64-v8a/libgraft.so
rm -rf /tmp/libgraft-linux-aarch64.tar.gz /tmp/graft-aarch64

echo "  → x86_64 (optional, for emulator)"
curl -L --progress-bar -o /tmp/libgraft-linux-x86_64.tar.gz \
  "${RELEASE_URL}/libgraft-ext-linux-x86_64.tar.gz"

# Extract and find the .so file
mkdir -p /tmp/graft-x86_64
tar -xzf /tmp/libgraft-linux-x86_64.tar.gz -C /tmp/graft-x86_64

# Find the .so file
SO_FILE=$(find /tmp/graft-x86_64 -name "*.so" -type f | head -n 1)
if [ -z "$SO_FILE" ]; then
  echo "Warning: No .so file found in x86_64 archive"
else
  mv "$SO_FILE" assets/extensions/android/x86_64/libgraft.so
fi

rm -rf /tmp/libgraft-linux-x86_64.tar.gz /tmp/graft-x86_64

# Note: armeabi-v7a not available in this release, using arm64 for modern devices

# Download iOS xcframework (only on macOS)
if [[ "$OSTYPE" == "darwin"* ]]; then
  echo ""
  echo "🍎 Downloading iOS xcframework..."
  
  echo "  → libgraft-ext.xcframework"
  curl -L --progress-bar -o /tmp/libgraft-ext.xcframework.zip \
    "${RELEASE_URL}/libgraft-ext.xcframework.zip"
  
  echo "  → Extracting..."
  unzip -q /tmp/libgraft-ext.xcframework.zip -d assets/extensions/ios/
  rm /tmp/libgraft-ext.xcframework.zip
  
  # Rename to expected name
  if [ -d "assets/extensions/ios/libgraft-ext.xcframework" ]; then
    mv assets/extensions/ios/libgraft-ext.xcframework assets/extensions/ios/Graft.xcframework
  fi
else
  echo ""
  echo "⚠️  Skipping iOS xcframework (not on macOS)"
fi

echo ""
echo "✓ Graft extensions downloaded successfully!"
echo ""
echo "📂 Files:"
ls -lh assets/extensions/android/*/libgraft.so 2>/dev/null || true
ls -lh assets/extensions/ios/Graft.xcframework/ 2>/dev/null || true

echo ""
echo "✅ Done! You can now run:"
echo "   pnpm start"

