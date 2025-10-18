#!/bin/bash

# Setup script to link SQLite extensions from desktop app
# This is used in development mode

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
CLI_DIR="$SCRIPT_DIR/.."
DESKTOP_EXT_DIR="$CLI_DIR/../desktop/dist-sqlite-ext"
CLI_EXT_DIR="$CLI_DIR/dist-sqlite-ext"

echo "Setting up SQLite extensions for CLI..."

# Check if desktop extensions exist
if [ ! -d "$DESKTOP_EXT_DIR" ]; then
    echo "Error: Desktop SQLite extensions not found at $DESKTOP_EXT_DIR"
    echo "Please build the desktop app first or download the extensions."
    exit 1
fi

# Remove existing symlink/directory
if [ -e "$CLI_EXT_DIR" ]; then
    rm -rf "$CLI_EXT_DIR"
fi

# Create symlink
ln -s "$DESKTOP_EXT_DIR" "$CLI_EXT_DIR"

echo "✓ SQLite extensions linked successfully"
echo "  From: $DESKTOP_EXT_DIR"
echo "  To:   $CLI_EXT_DIR"

