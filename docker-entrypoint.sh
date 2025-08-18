#!/bin/sh
set -e

# Ensure writable directories for node user
chown -R node:node /app/mx-cache /app/room-logs

# Run the provided command as the node user
exec su node -s /bin/sh -c "$*"
exec gosu node "$@"
