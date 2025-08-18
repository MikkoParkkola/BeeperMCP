#!/usr/bin/env bash
# build_docker.sh v1.1.5 (2025-08-18)
# Builds the Docker image using the built-in 'node' user; no USER_ID/GROUP_ID args needed.
set -euo pipefail

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required to parse package.json" >&2
  exit 1
fi

VERSION=$(jq -r '.version' package.json)
DATE=$(jq -r '.releaseDate' package.json)
IMAGE_NAME="beeper-mcp:${VERSION}"
OUTPUT_DIR="docker-images"

mkdir -p "$OUTPUT_DIR"

docker build -t "$IMAGE_NAME" .
# Run a simple command to verify the image builds correctly without requiring configuration.
docker run --rm "$IMAGE_NAME" node --version
docker save "$IMAGE_NAME" -o "$OUTPUT_DIR/beeper-mcp-${VERSION}-${DATE}.tar"

echo "Docker image saved to $OUTPUT_DIR/beeper-mcp-${VERSION}-${DATE}.tar"
