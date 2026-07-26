#!/bin/sh
set -eu

default_repository=mayneyao/eidos
repository=${EIDOS_GITHUB_REPOSITORY:-$default_repository}
version=${EIDOS_VERSION:-}
install_dir=${EIDOS_INSTALL_DIR:-"${HOME}/.local/bin"}
download_base=${EIDOS_DOWNLOAD_BASE:-"https://github.com/${repository}/releases/download"}
if [ -n "${EIDOS_LATEST_URL:-}" ]; then
  latest_url=$EIDOS_LATEST_URL
elif [ "$repository" = "$default_repository" ]; then
  latest_url=https://download.eidos.space/cli/latest
else
  latest_url="https://raw.githubusercontent.com/${repository}/dev/apps/cli/LATEST"
fi

usage() {
  cat <<'EOF'
Install the Eidos CLI.

Usage: install.sh [--version <semver>] [--install-dir <path>]

Environment overrides:
  EIDOS_VERSION              Exact CLI version. Defaults to apps/cli/LATEST.
  EIDOS_INSTALL_DIR          Destination directory. Defaults to ~/.local/bin.
  EIDOS_GITHUB_REPOSITORY    Release repository. Defaults to mayneyao/eidos.
  EIDOS_LATEST_URL           URL containing the default stable version.
  EIDOS_DOWNLOAD_BASE        Release download base URL.
EOF
}

fail() {
  printf 'eidos installer: %s\n' "$*" >&2
  exit 1
}

download() {
  source_url=$1
  destination=$2
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$source_url" -o "$destination"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$destination" "$source_url"
  else
    fail "curl or wget is required"
  fi
}

sha256_file() {
  input=$1
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$input" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$input" | awk '{print $1}'
  elif command -v openssl >/dev/null 2>&1; then
    openssl dgst -sha256 "$input" | awk '{print $NF}'
  else
    fail "sha256sum, shasum, or openssl is required"
  fi
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --version)
      [ "$#" -ge 2 ] || fail "--version requires a value"
      version=$2
      shift 2
      ;;
    --install-dir)
      [ "$#" -ge 2 ] || fail "--install-dir requires a value"
      install_dir=$2
      shift 2
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      fail "unknown argument: $1"
      ;;
  esac
done

temporary_directory=$(mktemp -d "${TMPDIR:-/tmp}/eidos-cli.XXXXXX")
trap 'rm -rf "$temporary_directory"' EXIT HUP INT TERM

if [ -z "$version" ]; then
  download "$latest_url" "$temporary_directory/LATEST"
  version=$(tr -d '[:space:]' <"$temporary_directory/LATEST")
fi
version=${version#cli-v}
version=${version#v}
printf '%s' "$version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$' ||
  fail "invalid version: $version"

kernel=${EIDOS_UNAME_S:-$(uname -s)}
machine=${EIDOS_UNAME_M:-$(uname -m)}
case "$kernel:$machine" in
  Darwin:arm64 | Darwin:aarch64)
    target=aarch64-apple-darwin
    ;;
  Darwin:x86_64 | Darwin:amd64)
    target=x86_64-apple-darwin
    ;;
  Linux:x86_64 | Linux:amd64)
    target=x86_64-unknown-linux-gnu
    ;;
  *)
    fail "unsupported platform: $kernel $machine"
    ;;
esac

tag="cli-v${version}"
archive="eidos-cli-v${version}-${target}.tar.gz"
archive_path="$temporary_directory/$archive"
checksums_path="$temporary_directory/SHA256SUMS"
release_url="${download_base}/${tag}"

printf 'Downloading Eidos CLI %s for %s...\n' "$version" "$target"
download "${release_url}/${archive}" "$archive_path"
download "${release_url}/SHA256SUMS" "$checksums_path"

expected_checksum=$(awk -v archive="$archive" '$2 == archive { print $1; exit }' "$checksums_path")
[ -n "$expected_checksum" ] || fail "SHA256SUMS has no entry for $archive"
actual_checksum=$(sha256_file "$archive_path")
[ "$actual_checksum" = "$expected_checksum" ] || fail "checksum mismatch for $archive"

extract_dir="$temporary_directory/extract"
mkdir -p "$extract_dir"
tar -xzf "$archive_path" -C "$extract_dir"
[ -f "$extract_dir/eidos" ] || fail "archive does not contain the eidos binary"

mkdir -p "$install_dir"
temporary_target="$install_dir/.eidos.tmp.$$"
cp "$extract_dir/eidos" "$temporary_target"
chmod 755 "$temporary_target"
mv -f "$temporary_target" "$install_dir/eidos"

printf 'Installed Eidos CLI %s to %s/eidos\n' "$version" "$install_dir"
case ":${PATH:-}:" in
  *":$install_dir:"*) ;;
  *)
    printf 'Add %s to PATH, then restart your shell.\n' "$install_dir"
    ;;
esac
