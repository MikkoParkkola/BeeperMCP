#!/usr/bin/env bash
set -euo pipefail

mkdir -p build

# Build dist and SEA entry
npm run build
npm run build:sea-entry

# Write SEA config and generate blob
node -e "require('fs').writeFileSync('sea-config.json', JSON.stringify({main:'./build/sea-entry.cjs', output:'sea-prep.blob', disableExperimentalSEAWarning:true}, null, 2))"
node --experimental-sea-config sea-config.json

# Fetch Node 22 runtime (macOS arm64) and copy as base
pushd build >/dev/null
curl -fsSL https://nodejs.org/dist/v22.7.0/node-v22.7.0-darwin-arm64.tar.xz -o node22.tar.xz
tar -xJf node22.tar.xz
rm -f node22.tar.xz
popd >/dev/null

RUNTIME="build/node-v22.7.0-darwin-arm64/bin/node"
cp "$RUNTIME" build/beepermcp.sea

# Extract SEA fuse symbol from runtime
FUSE=$(strings "$RUNTIME" | sed -n 's/.*\(NODE_SEA_FUSE_[a-f0-9]\{32\}\).*/\1/p' | head -n1)
echo "Using SEA fuse: $FUSE"

# Inject SEA blob
npx -y postject build/beepermcp.sea NODE_SEA_BLOB sea-prep.blob --sentinel-fuse "$FUSE"

# Prepare runnable binary, clear xattrs, and ad-hoc sign
cp -X build/beepermcp.sea build/beepermcp.sea.run || cp build/beepermcp.sea build/beepermcp.sea.run
xattr -c build/beepermcp.sea.run || true
codesign --force --sign - --timestamp=none build/beepermcp.sea.run
codesign --verify --verbose build/beepermcp.sea.run
echo "Built (Node22): build/beepermcp.sea.run"
file build/beepermcp.sea.run
ls -lh build/beepermcp.sea.run

