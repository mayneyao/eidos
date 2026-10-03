#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
platform="${1:-iphonesimulator}"
case "$platform" in
  iphonesimulator) target=aarch64-apple-ios-sim ;;
  iphoneos) target=aarch64-apple-ios ;;
  *) echo 'Usage: bash scripts/build.sh [iphonesimulator|iphoneos]' >&2; exit 1 ;;
esac
if ! rustup target list --installed | grep -qx "$target"; then
  echo "Missing Rust target. Install explicitly: rustup target add $target" >&2
  exit 1
fi
pnpm build:web
export SDKROOT="$(xcrun --sdk "$platform" --show-sdk-path)"
export BINDGEN_EXTRA_CLANG_ARGS="-isysroot $SDKROOT -mios-version-min=17.0"
export IPHONEOS_DEPLOYMENT_TARGET=17.0
cargo build --manifest-path native/Cargo.toml --locked --target "$target" --release
mkdir -p "build/native/$platform"
cp "native/target/$target/release/libeidos_ios_host.a" "build/native/$platform/"
xcodegen generate
xcodebuild -project EidosIOS.xcodeproj -scheme EidosIOS -sdk "$platform" -configuration Debug -derivedDataPath build/DerivedData ARCHS=arm64 build
