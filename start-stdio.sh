#!/bin/bash
# Start BeeperMCP in STDIO mode (for local MCP clients like BoltAI)
echo "Starting BeeperMCP in STDIO mode..." >&2
cd "$(dirname "$0")"
export MCP_STDIO_MODE=1
node dist/beeper-mcp-server.js
