#!/usr/bin/env bash
# build_docker.sh v1.1.4 (2025-08-18)
# Builds the Docker image using the built-in 'node' user; no USER_ID/GROUP_ID args needed.
set -euo pipefail

VERSION=$(node -p "require('./package.json').version")
DATE=$(node -p "require('./package.json').releaseDate")
IMAGE_NAME="beeper-mcp:${VERSION}"
OUTPUT_DIR="docker-images"

mkdir -p "$OUTPUT_DIR"

docker build -t "$IMAGE_NAME" .
docker run --rm "$IMAGE_NAME" node --version
docker save "$IMAGE_NAME" -o "$OUTPUT_DIR/beeper-mcp-${VERSION}-${DATE}.tar"

echo "Docker image saved to $OUTPUT_DIR/beeper-mcp-${VERSION}-${DATE}.tar"
