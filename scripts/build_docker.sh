#!/usr/bin/env bash
# build_docker.sh v1.1.1 (2025-08-16)
set -euo pipefail

VERSION=$(node -p "require('./package.json').version")
DATE=$(node -p "require('./package.json').releaseDate")
IMAGE_NAME="beeper-mcp:${VERSION}"
OUTPUT_DIR="docker-images"

mkdir -p "$OUTPUT_DIR"

docker build -t "$IMAGE_NAME" .
docker save "$IMAGE_NAME" -o "$OUTPUT_DIR/beeper-mcp-${VERSION}-${DATE}.tar"

echo "Docker image saved to $OUTPUT_DIR/beeper-mcp-${VERSION}-${DATE}.tar"
