#!/bin/bash
# Build static-linked graft for Android
# This script compiles graft from source with static linking to avoid libgcc_s.so.1 dependency

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_DIR="$PROJECT_ROOT/android-graft-build"

echo "🔧 Building static-linked graft for Android..."
echo "Project root: $PROJECT_ROOT"
echo "Build directory: $BUILD_DIR"

# Check prerequisites
echo ""
echo "📋 Checking prerequisites..."

# Check for Rust
if ! command -v cargo &> /dev/null; then
    echo "❌ Rust is not installed. Please install from https://rustup.rs/"
    exit 1
fi
echo "✓ Rust installed: $(rustc --version)"

# Check for Android NDK
if [ -z "$ANDROID_NDK_HOME" ] && [ -z "$NDK_HOME" ]; then
    echo "❌ Android NDK not found. Please set ANDROID_NDK_HOME or NDK_HOME"
    echo "   Example: export ANDROID_NDK_HOME=~/Library/Android/sdk/ndk/26.1.10909125"
    exit 1
fi
NDK_PATH="${ANDROID_NDK_HOME:-$NDK_HOME}"
echo "✓ Android NDK: $NDK_PATH"

# Install cross-compilation targets
echo ""
echo "📦 Installing Rust Android targets..."
rustup target add aarch64-linux-android
# Optional: add more architectures
# rustup target add armv7-linux-androideabi
# rustup target add i686-linux-android
# rustup target add x86_64-linux-android

# Setup Android NDK toolchain
echo ""
echo "🛠️  Configuring Android NDK toolchain..."

# Find NDK version
NDK_VERSION=$(ls "$NDK_PATH" 2>/dev/null | head -n 1)
if [ -z "$NDK_VERSION" ]; then
    # If NDK_PATH points to a versioned directory
    NDK_VERSION=$(basename "$NDK_PATH")
fi

# Set up toolchain paths
TOOLCHAIN_PREFIX="$NDK_PATH/toolchains/llvm/prebuilt/darwin-x86_64"
if [ ! -d "$TOOLCHAIN_PREFIX" ]; then
    # Try alternative path for newer NDKs
    TOOLCHAIN_PREFIX="$NDK_PATH/toolchains/llvm/prebuilt/darwin-aarch64"
fi

if [ ! -d "$TOOLCHAIN_PREFIX" ]; then
    echo "❌ Could not find NDK toolchain in $NDK_PATH"
    exit 1
fi

echo "✓ Toolchain prefix: $TOOLCHAIN_PREFIX"

# Setup cargo config for Android cross-compilation
mkdir -p ~/.cargo
cat > ~/.cargo/config.toml <<EOF
[target.aarch64-linux-android]
ar = "$TOOLCHAIN_PREFIX/bin/llvm-ar"
linker = "$TOOLCHAIN_PREFIX/bin/aarch64-linux-android30-clang"

[target.armv7-linux-androideabi]
ar = "$TOOLCHAIN_PREFIX/bin/llvm-ar"
linker = "$TOOLCHAIN_PREFIX/bin/armv7a-linux-androideabi30-clang"

[target.i686-linux-android]
ar = "$TOOLCHAIN_PREFIX/bin/llvm-ar"
linker = "$TOOLCHAIN_PREFIX/bin/i686-linux-android30-clang"

[target.x86_64-linux-android]
ar = "$TOOLCHAIN_PREFIX/bin/llvm-ar"
linker = "$TOOLCHAIN_PREFIX/bin/x86_64-linux-android30-clang"
EOF

echo "✓ Cargo config updated"

# Clone graft repository
echo ""
echo "📥 Cloning graft repository..."
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"

git clone https://github.com/orbitinghail/graft.git
cd graft

# Get latest release tag
LATEST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "main")
echo "Building version: $LATEST_TAG"
git checkout "$LATEST_TAG" 2>/dev/null || true

# Build for arm64-v8a (aarch64)
echo ""
echo "🔨 Building for arm64-v8a (aarch64-linux-android)..."
echo "This may take several minutes..."

# Set environment variables for static linking
export RUSTFLAGS="-C target-feature=+crt-static -C link-arg=-static-libgcc"
export CC="$TOOLCHAIN_PREFIX/bin/aarch64-linux-android30-clang"
export CXX="$TOOLCHAIN_PREFIX/bin/aarch64-linux-android30-clang++"
export AR="$TOOLCHAIN_PREFIX/bin/llvm-ar"

# Build graft extension
cargo build --release --target aarch64-linux-android

# Copy to project
echo ""
echo "📦 Copying built library to project..."
OUTPUT_DIR="$PROJECT_ROOT/android/app/src/main/jniLibs/arm64-v8a"
mkdir -p "$OUTPUT_DIR"

# Find the built library
BUILT_LIB=$(find target/aarch64-linux-android/release -name "libgraft.so" | head -n 1)

if [ -z "$BUILT_LIB" ]; then
    # Try alternative names
    BUILT_LIB=$(find target/aarch64-linux-android/release -name "lib*graft*.so" | head -n 1)
fi

if [ -z "$BUILT_LIB" ]; then
    echo "❌ Could not find built library"
    echo "Contents of build directory:"
    ls -la target/aarch64-linux-android/release/ | grep -E "\.so|\.a"
    exit 1
fi

cp "$BUILT_LIB" "$OUTPUT_DIR/libgraft.so"

echo "✓ Library copied to: $OUTPUT_DIR/libgraft.so"

# Verify dependencies
echo ""
echo "🔍 Verifying library dependencies..."
echo "Library info:"
file "$OUTPUT_DIR/libgraft.so"
echo ""
echo "Dependencies (should NOT include libgcc_s.so.1):"
# Note: On macOS, we can't easily check Android library dependencies
# This would need to be checked on Linux or with Android tools
if command -v readelf &> /dev/null; then
    readelf -d "$OUTPUT_DIR/libgraft.so" | grep NEEDED || echo "No dynamic dependencies found"
else
    echo "⚠️  readelf not available. Install binutils to verify dependencies."
    echo "You can verify on the device after installation."
fi

# Cleanup
echo ""
echo "🧹 Cleaning up build directory..."
cd "$PROJECT_ROOT"
# Uncomment to remove build directory
# rm -rf "$BUILD_DIR"

echo ""
echo "✅ Build complete!"
echo ""
echo "Next steps:"
echo "1. Rebuild your Dev Client:"
echo "   cd $PROJECT_ROOT && pnpm android"
echo ""
echo "2. Install and test the new APK"
echo ""
echo "The static-linked libgraft.so is located at:"
echo "   $OUTPUT_DIR/libgraft.so"

