#!/bin/sh
set -e

chown -R node:node /app/mx-cache /app/room-logs

exec gosu node "$@"
