# BeeperMCP Setup Guide

This guide helps you set up BeeperMCP with backward compatibility for various MCP clients, including BoltAI.

## 🚀 Quick Setup

### 1. Automated Installation

```bash
# Make the installer executable and run it
chmod +x install.sh
./install.sh
```

This will:
- Check Node.js version (requires v22+)
- Install dependencies
- Build the project
- Create configuration files
- Generate startup scripts
- Run basic tests

### 2. Configure Your Matrix Credentials

Edit `.beeper-mcp-server.env`:
```bash
MATRIX_HOMESERVER=https://matrix.beeper.com
MATRIX_USERID=@your-username:beeper.com
MATRIX_TOKEN=your-matrix-token-here
```

### 3. Configure MCP Clients

```bash
# Automatically detect and configure MCP clients
node mcp-client-config.js

# Or detect only
node mcp-client-config.js detect

# Or show manual instructions
node mcp-client-config.js manual
```

## 🔧 Protocol Compatibility

BeeperMCP supports multiple MCP protocol versions for maximum compatibility:

- **2024-11-05**: Maximum compatibility (recommended for BoltAI and older clients)
- **2025-03-26**: Latest features with OAuth support
- **2025-06-18**: Current spec with enhanced security

The server automatically negotiates the best compatible version with each client.

## 📱 Client-Specific Setup

### BoltAI (STDIO Mode)

BoltAI works best with the older MCP protocol version. The configuration script automatically sets this up:

```json
{
  "beeper": {
    "command": "node",
    "args": ["./dist/beeper-mcp-server.js"],
    "cwd": "/path/to/BeeperMCP",
    "env": {
      "MCP_STDIO_MODE": "1"
    }
  }
}
```

### Claude Desktop

Configuration goes in `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "beeper": {
      "command": "node",
      "args": ["./start-stdio.sh"],
      "cwd": "/path/to/BeeperMCP",
      "env": {}
    }
  }
}
```

### Other Clients

Most MCP clients support similar configuration. Use:
- **Command**: `node`
- **Args**: `["./dist/beeper-mcp-server.js"]`
- **Environment**: `MCP_STDIO_MODE=1`
- **Working Directory**: Path to your BeeperMCP installation

## 🔄 Running the Server

### STDIO Mode (for local clients like BoltAI)
```bash
./start-stdio.sh
```

### HTTP Mode (for remote clients)
```bash
./start-http.sh
```

### Manual Start
```bash
# STDIO mode
MCP_STDIO_MODE=1 node dist/beeper-mcp-server.js

# HTTP mode
MCP_HTTP_MODE=1 MCP_SERVER_PORT=3000 node dist/beeper-mcp-server.js
```

## 💾 Configuration Backup & Restore

### Save your configuration for reuse on other machines:
```bash
node config-backup.js save
```

### Restore configuration:
```bash
node config-backup.js restore
```

The backup sanitizes sensitive tokens but preserves your configuration structure.

## 🐛 Troubleshooting

### BoltAI Not Connecting

1. **Check Protocol Version**: BoltAI may only support older MCP versions
2. **Verify STDIO Mode**: Ensure `MCP_STDIO_MODE=1` is set
3. **Test Connection**:
   ```bash
   node mcp-client-config.js test
   ```

### General Issues

1. **Build the project**: `npm run build`
2. **Check logs**: Look at stderr output for error messages
3. **Verify credentials**: Ensure your Matrix token is valid
4. **Test STDIO manually**:
   ```bash
   echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | MCP_STDIO_MODE=1 node dist/beeper-mcp-server.js
   ```

### Protocol Version Issues

If a client doesn't work, try forcing an older protocol version by modifying the client configuration to use the `start-stdio.sh` script, which defaults to maximum compatibility.

## 📁 File Structure

After setup, you'll have:

```
BeeperMCP/
├── dist/                          # Built JavaScript files
├── src/                          # TypeScript source
├── .beeper-mcp-server.env        # Your configuration
├── start-stdio.sh                # STDIO mode launcher
├── start-http.sh                 # HTTP mode launcher
├── install.sh                    # Installation script
├── config-backup.js              # Backup utility
├── mcp-client-config.js          # Client configuration tool
└── beeper-mcp-config-backup.json # Your config backup
```

## 🔒 Security Notes

- **Local STDIO Mode**: No API key required, secure by default
- **HTTP Mode**: Requires API key for authentication
- **Token Safety**: Configuration backup sanitizes Matrix tokens
- **Private Data**: Never commit `.beeper-mcp-server.env` to git

## 🆘 Getting Help

1. Run diagnostic: `node mcp-client-config.js test`
2. Check client logs for connection errors
3. Verify Matrix credentials are correct
4. Try different MCP protocol versions
5. Test with manual STDIO command above

## 📦 Dependencies

- **Node.js**: v22 or later
- **TypeScript**: For building from source
- **Matrix.js SDK**: For Matrix protocol support
- **MCP SDK**: v1.17.3 with multi-version support

The automated installer checks all dependencies and guides you through setup.