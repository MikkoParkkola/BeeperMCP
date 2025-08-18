#!/bin/sh
set -euo pipefail

# Ensure writable directories for node user
chown -R node:node /app/mx-cache /app/room-logs

exec gosu node "$@"
