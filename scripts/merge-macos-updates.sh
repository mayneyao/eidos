#!/bin/bash

set -euo pipefail

# Merge macOS update files from Intel and ARM builds
# Usage: ./merge-macos-updates.sh [artifacts_dir] [channel]
#   channel: "latest" (default) or "beta"

ARTIFACTS_DIR="${1:-./artifacts}"
CHANNEL="${2:-latest}"
# electron-builder always generates latest-mac.yml regardless of channel
INTEL_FILE="$ARTIFACTS_DIR/macos-intel-artifacts/latest-mac.yml"
ARM_FILE="$ARTIFACTS_DIR/macos-arm-artifacts/latest-mac.yml"
MERGED_FILE="$ARTIFACTS_DIR/${CHANNEL}-mac.yml"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if both files exist
if [[ ! -f "$INTEL_FILE" ]] || [[ ! -f "$ARM_FILE" ]]; then
    log_warning "One or both macOS update files not found, skipping merge"
    log_info "Intel file: $INTEL_FILE ($(if [[ -f "$INTEL_FILE" ]]; then echo "exists"; else echo "missing"; fi))"
    log_info "ARM file: $ARM_FILE ($(if [[ -f "$ARM_FILE" ]]; then echo "exists"; else echo "missing"; fi))"
    exit 0
fi

log_info "Merging macOS update files..."

# Extract versions from both files
extract_version() {
    local file="$1"
    grep "^version:" "$file" | sed 's/version: //' | tr -d ' '
}

extract_files_section() {
    local file="$1"
    # Extract the files section (everything between "files:" and the next top-level key)
    awk '
        BEGIN { in_files=0; found_files=0 }
        /^files:/ { in_files=1; found_files=1; next }
        /^[^ ]/ && found_files && in_files { in_files=0 }
        in_files { print }
    ' "$file" | sed 's/^  //' | sed '/^$/d'
}

extract_other_fields() {
    local file="$1"
    # Extract all fields except files and version (we'll use ARM values for these)
    grep -E "^(path|sha512|releaseDate):" "$file"
}

INTEL_VERSION=$(extract_version "$INTEL_FILE")
ARM_VERSION=$(extract_version "$ARM_FILE")

log_info "Intel version: $INTEL_VERSION"
log_info "ARM version: $ARM_VERSION"

# Validate that versions match
if [[ "$INTEL_VERSION" != "$ARM_VERSION" ]]; then
    log_error "Version mismatch: Intel ($INTEL_VERSION) vs ARM ($ARM_VERSION)"
    exit 1
fi

log_info "Versions match, proceeding with merge..."

# Extract file lists from both builds
INTEL_FILES=$(extract_files_section "$INTEL_FILE")
ARM_FILES=$(extract_files_section "$ARM_FILE")

# Extract other fields from ARM build (assuming it's more recent)
ARM_FIELDS=$(extract_other_fields "$ARM_FILE")

# Create merged YAML content
{
    echo "version: $ARM_VERSION"
    echo "files:"
    if [[ -n "$INTEL_FILES" ]]; then
        echo "$INTEL_FILES" | sed 's/^/  /'
    fi
    if [[ -n "$ARM_FILES" ]]; then
        echo "$ARM_FILES" | sed 's/^/  /'
    fi
    echo "$ARM_FIELDS"
} > "$MERGED_FILE"

# Remove original files
rm -f "$INTEL_FILE" "$ARM_FILE"

log_success "Successfully merged macOS update files"
log_info "Merged file content:"
echo "----------------------------------------"
cat "$MERGED_FILE"
echo "----------------------------------------"

log_success "macOS update files merged successfully!"
