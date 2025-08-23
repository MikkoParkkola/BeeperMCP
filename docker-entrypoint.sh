#!/usr/bin/env bash
set -euo pipefail

if [ "$(id -u)" = '0' ]; then
  exec gosu node "$@"
fi

exec "$@"
