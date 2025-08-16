#!/usr/bin/env bash
# build_docker.sh v1.1.0 (2025-08-16)
set -euo pipefail

VERSION=$(jq -r '.version' package.json)
DATE=$(jq -r '.releaseDate' package.json)
IMAGE_NAME="beeper-mcp:${VERSION}"
OUTPUT_DIR="docker-images"

mkdir -p "$OUTPUT_DIR"

docker build -t "$IMAGE_NAME" .
docker save "$IMAGE_NAME" -o "$OUTPUT_DIR/beeper-mcp-${VERSION}-${DATE}.tar"

echo "Docker image saved to $OUTPUT_DIR/beeper-mcp-${VERSION}-${DATE}.tar"
