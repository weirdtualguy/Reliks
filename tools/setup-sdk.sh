#!/bin/sh
# setup-sdk.sh — download the official Kaspa WASM SDK (v2.1.0) and install the
# Node.js build into vendor/kaspa-wasm/ for the Resolver/Borsh submit path.
# The SDK is NOT committed to the repo (11.5 MB wasm); run this once per checkout.
# Needs: curl, unzip. Downloads ~57 MB, keeps ~12 MB.
set -e
cd "$(dirname "$0")/.."
SDK_VERSION="${KASPA_SDK_VERSION:-2.1.0}"
ZIP_URL="https://github.com/kaspanet/rusty-kaspa/releases/download/v${SDK_VERSION}/kaspa-wasm32-sdk-v${SDK_VERSION}.zip"
VENDOR_DIR="vendor/kaspa-wasm"

if [ -f "$VENDOR_DIR/kaspa.js" ] && [ -f "$VENDOR_DIR/kaspa_bg.wasm" ]; then
  echo "SDK already installed in $VENDOR_DIR — skipping download."
  echo "Delete $VENDOR_DIR to force a fresh download."
  exit 0
fi

echo "Downloading Kaspa WASM SDK v$SDK_VERSION (~57 MB)..."
TMP_ZIP="$(mktemp).zip"
trap 'rm -f "$TMP_ZIP"' EXIT
curl -sL --fail -o "$TMP_ZIP" "$ZIP_URL"
mkdir -p "$VENDOR_DIR"
unzip -q -o "$TMP_ZIP" "kaspa-wasm32-sdk/nodejs/kaspa/*" -d .sdk-tmp
cp .sdk-tmp/kaspa-wasm32-sdk/nodejs/kaspa/* "$VENDOR_DIR"/
rm -rf .sdk-tmp
ls -la "$VENDOR_DIR/kaspa.js" "$VENDOR_DIR/kaspa_bg.wasm" "$VENDOR_DIR/kaspa.d.ts"
echo "SDK installed in $VENDOR_DIR."
echo "Verify it resolves a node: node tools/resolve-node.js mainnet borsh --verify"
