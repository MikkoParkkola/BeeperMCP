#!/bin/bash
# Start BeeperMCP in HTTP mode (for remote MCP clients)
echo "Starting BeeperMCP in HTTP mode on port 3000..." >&2
cd "$(dirname "$0")"
export MCP_HTTP_MODE=1
export MCP_SERVER_PORT=3000
node dist/beeper-mcp-server.js
