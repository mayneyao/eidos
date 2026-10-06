#!/usr/bin/env bash
set -euo pipefail
android_root="$(cd "$(dirname "$0")/.." && pwd)"
# Older std::fs::File locking always returns Unsupported on Android. Keep the
# Android toolchain independent of the CLI's MSRV and preserve real file locks.
android_rust_toolchain=1.99.0
sdk_root="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
ndk_root="${ANDROID_NDK_HOME:-$sdk_root/ndk/27.1.12297006}"
case "$(uname -s)" in
  Darwin) host_tag=darwin-x86_64 ;;
  Linux) host_tag=linux-x86_64 ;;
  *) echo "Native build supports macOS or Linux hosts." >&2; exit 1 ;;
esac
toolchain="$ndk_root/toolchains/llvm/prebuilt/$host_tag/bin"
if [[ ! -x "$toolchain/clang" ]]; then
  echo "Install Android NDK 27.1.12297006 or set ANDROID_NDK_HOME." >&2
  exit 1
fi
export CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER="$toolchain/aarch64-linux-android28-clang"
export CC_aarch64_linux_android="$CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER"
export AR_aarch64_linux_android="$toolchain/llvm-ar"
export CARGO_TARGET_X86_64_LINUX_ANDROID_LINKER="$toolchain/x86_64-linux-android28-clang"
export CC_x86_64_linux_android="$CARGO_TARGET_X86_64_LINUX_ANDROID_LINKER"
export AR_x86_64_linux_android="$toolchain/llvm-ar"
export BINDGEN_EXTRA_CLANG_ARGS_aarch64_linux_android="--sysroot=$ndk_root/toolchains/llvm/prebuilt/$host_tag/sysroot -I$ndk_root/toolchains/llvm/prebuilt/$host_tag/sysroot/usr/include/aarch64-linux-android"
export BINDGEN_EXTRA_CLANG_ARGS_x86_64_linux_android="--sysroot=$ndk_root/toolchains/llvm/prebuilt/$host_tag/sysroot -I$ndk_root/toolchains/llvm/prebuilt/$host_tag/sysroot/usr/include/x86_64-linux-android"
export CARGO_TARGET_AARCH64_LINUX_ANDROID_RUSTFLAGS="-C link-arg=-Wl,-z,max-page-size=16384"
export CARGO_TARGET_X86_64_LINUX_ANDROID_RUSTFLAGS="-C link-arg=-Wl,-z,max-page-size=16384"
native_workspace="$(node "$android_root/../../scripts/prepare-mobile-native.mjs" android)"
cd "$native_workspace"
for entry in 'aarch64-linux-android arm64-v8a' 'x86_64-linux-android x86_64'; do
  read -r target abi <<< "$entry"
  cargo "+$android_rust_toolchain" build -p eidos-mobile-host --features planned-transfer-progress --release --locked --target "$target" --target-dir "$android_root/../../target"
  destination="$android_root/app/build/native/jniLibs/$abi"
  mkdir -p "$destination"
  cp "$android_root/../../target/$target/release/libeidos_mobile_host.so" "$destination/"
done
