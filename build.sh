#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP_DIR="$ROOT_DIR/desktop"
TAURI_DIR="$DESKTOP_DIR/src-tauri"

case "$(uname -m)" in
  x86_64 | amd64)
    GOARCH="amd64"
    TARGET="x86_64-unknown-linux-gnu"
    ;;
  aarch64 | arm64)
    GOARCH="arm64"
    TARGET="aarch64-unknown-linux-gnu"
    ;;
  *)
    echo "Unsupported architecture: $(uname -m)" >&2
    exit 1
    ;;
esac

require() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require go
require cargo
require node

if ! command -v yarn >/dev/null 2>&1; then
  corepack enable yarn
fi
require yarn

if ! command -v patchelf >/dev/null 2>&1; then
  echo "Warning: patchelf not found. AppImage bundling may fail." >&2
  echo "Install it with: sudo apt-get install -y patchelf" >&2
fi

SIDECAR="$TAURI_DIR/bin/devpod-cli-$TARGET"

echo "==> Building devpod CLI sidecar (linux/$GOARCH)"
mkdir -p "$TAURI_DIR/bin"
cd "$ROOT_DIR"
CGO_ENABLED=0 GOOS=linux GOARCH="$GOARCH" go build -ldflags "-s -w" -o "$SIDECAR" .

echo "==> Installing frontend dependencies"
cd "$DESKTOP_DIR"
yarn install

CONFIG="src-tauri/tauri-dev.conf.json"
FEATURES=()

if [[ "${UPDATER:-0}" == "1" ]]; then
  CONFIG="src-tauri/tauri.conf.json"
  FEATURES=(--features enable-updater)
fi

echo "==> Building AppImage"
yarn tauri build --config "$CONFIG" --bundles appimage "${FEATURES[@]}"

echo "==> Done"
ls -lh "$TAURI_DIR"/target/release/bundle/appimage/*.AppImage
