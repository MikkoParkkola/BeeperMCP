#!/bin/sh
set -euo pipefail

exec gosu node "$@"
