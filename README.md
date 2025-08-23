# 🐝 BeeperMCP - Matrix Intelligence Hub

<div align="center">
  <img src="docs/screenshots/hero-banner.png" alt="BeeperMCP Dashboard" width="800px">
  <br>
  <br>
  <strong>Transform your Matrix conversations into actionable intelligence</strong>
  <br>
  <br>
</div>

BeeperMCP is a powerful Matrix client wrapper that exposes chats and actions through the [Model Context Protocol](https://github.com/openai/modelcontextprotocol), featuring a stunning web interface for real-time conversation analytics. It syncs your Matrix rooms, decrypts messages using Olm, stores chat logs and media locally, and provides both MCP tools and a beautiful web dashboard.

## ✨ Stunning Web Interface

**🚀 Launch instantly with one command:**
```bash
# Download and run the binary
curl -L https://github.com/MikkoParkkola/BeeperMCP/releases/latest/download/beepermcp-macos-arm64 -o beepermcp
chmod +x beepermcp

# Launch the beautiful web UI
./beepermcp ui
```

**Features:**
- 💬 **Live Message Analytics** - Watch conversations flow with real-time sentiment analysis
- 🔍 **Smart Search & Context** - AI-powered search across your entire chat history
- 📊 **Beautiful Visualizations** - Stunning charts and metrics with glassmorphism design
- 🎨 **Interactive Dashboard** - Responsive interface that works on all devices
- ⚡ **Real-time Updates** - Live metrics and animated message flows

> 🎬 **[View Live Demo](https://beepermcp-demo.vercel.app)** | 📖 **[UI Documentation](docs/web-ui.md)**

## 🎯 Key Features

### 🖥️ **Web Interface**
- **Live Analytics Dashboard** with real-time conversation metrics
- **Sentiment Analysis** showing emotional trends across rooms
- **Smart Search** with context-aware filtering and highlighting
- **Interactive Visualizations** with smooth animations and hover effects
- **Mobile-Responsive** design that works perfectly on all devices

### 🤖 **MCP Integration** 
- **Matrix Protocol Support** - Syncs events from your Beeper homeserver
- **End-to-End Encryption** - Decrypts encrypted rooms using Olm
- **Smart Storage** - SQLite indexing with metadata tracking
- **MCP Tools**: `list_rooms`, `create_room`, `list_messages`, `send_message`
- **Secure Caching** - Encrypted local storage with owner-only permissions

### 🔐 **Privacy & Security**
- **Local Processing** - All analytics run on your machine
- **Encrypted Storage** - Optional encryption for logs and media
- **API Key Protection** - Secure authentication for all endpoints
- **Rate Limiting** - Built-in protection against abuse

## 🚀 Quick Start

### Option 1: Binary (Recommended)
```bash
# Download binary for your platform
curl -L https://github.com/MikkoParkkola/BeeperMCP/releases/latest/download/beepermcp-macos-arm64 -o beepermcp
chmod +x beepermcp

# Launch web UI (auto-configures on first run)
./beepermcp ui

# Or start MCP server
./beepermcp server
```

### Option 2: From Source
1. Clone the repository and move into it:
   ```bash
   git clone <repo-url>
   cd BeeperMCP
   ```

2. Copy the sample environment file and edit it:
   ```bash
   cp .beeper-mcp-server.env.example .beeper-mcp-server.env
   $EDITOR .beeper-mcp-server.env
   ```

3. Run the interactive setup script:
   ```bash
   node setup.js
   ```

## 📱 Web UI Usage

### Instant Launch
```bash
# Launch with default settings
./beepermcp ui

# Custom port and theme
./beepermcp ui --port 8080 --theme dark

# Enable admin features
./beepermcp ui --admin
```

### Features in Action

#### 💬 Live Message Flow
Watch your conversations flow across the screen in real-time with:
- **Animated message bubbles** showing actual conversation content
- **Dynamic sentiment indicators** with color-coded emotions
- **Participant tracking** with user activity metrics
- **Real-time counters** updating as new messages arrive

#### 📊 Interactive Analytics
Explore your conversation data with:
- **Sentiment trend charts** showing emotional patterns over time
- **Activity heatmaps** revealing peak conversation times
- **Participant analysis** with engagement metrics
- **Search functionality** with instant results and highlighting

#### 🔍 Smart Search
Find exactly what you're looking for:
- **Natural language queries** like "deployment issues last week"
- **Context-aware results** showing relevant conversations
- **Participant filtering** to focus on specific team members
- **Time-range selection** with visual timeline scrubbing

### Screenshots

| Dashboard | Analytics | Search |
|-----------|-----------|--------|
| ![Dashboard](docs/screenshots/dashboard.png) | ![Analytics](docs/screenshots/analytics.png) | ![Search](docs/screenshots/search.png) |

## 🔧 Binary Commands

### Core Commands
```bash
# Launch web UI
./beepermcp ui

# Start MCP server  
./beepermcp server

# Interactive chat mode
./beepermcp chat

# Show status
./beepermcp status
```

### Configuration
```bash
# Configure providers
./beepermcp config

# Test connectivity
./beepermcp test

# View logs
./beepermcp logs

# Update to latest version
./beepermcp update
```

### Advanced Options
```bash
# Enable debug mode
./beepermcp ui --debug --verbose

# Custom data directory
./beepermcp --data-dir /path/to/data server

# Export conversation data
./beepermcp export --format json --output backup.json
```

## Docker deployment

The repository includes a multi-stage Dockerfile suitable for local or multi-tenant hosting. The runtime image runs as the built-in `node` user and stores state under `/app/mx-cache` and `/app/room-logs`.

Build the image:

```bash
docker build -t beeper-mcp .
```

Alternatively, use the helper script to tag the image with the package version and release date (requires `jq`):

```bash
bash scripts/build_docker.sh
```

Pre-built images are published to GitHub Container Registry on each push to `main` and for version tags:

```bash
docker pull ghcr.io/MikkoParkkola/beepermcp:latest
```

Run with the web UI enabled:

```bash
docker run -p 8757:8757 -p 3000:3000 -p 8080:8080 \
  -v mcp-cache:/app/mx-cache -v mcp-logs:/app/room-logs \
  --env-file .beeper-mcp-server.env \
  ghcr.io/MikkoParkkola/beepermcp:latest ui
```

## Configuration

### Environment Variables

Core Matrix settings:
- `MATRIX_USERID` – your Matrix user ID (required)
- `MATRIX_TOKEN` – access token (or use `MATRIX_PASSWORD`)
- `MATRIX_HOMESERVER` – homeserver URL (`https://matrix.beeper.com`)

Web UI settings:
- `UI_PORT` – web interface port (`8080`)
- `UI_THEME` – interface theme (`dark`, `light`, `auto`)
- `UI_ENABLE_ADMIN` – enable admin features (`false`)
- `UI_UPDATE_INTERVAL` – metrics update frequency in ms (`1000`)

Storage and security:
- `MESSAGE_LOG_DIR` – directory for room logs (`./room-logs`)
- `SESSION_SECRET` – encrypt session cache on disk
- `LOG_SECRET` – encrypt per-room log files
- `MEDIA_SECRET` – encrypt downloaded media files

Advanced options:
- `LOG_LEVEL` – verbosity (`info`, `debug`, `trace`)
- `BACKFILL_CONCURRENCY` – simultaneous backfill requests (`5`)
- `LOG_MAX_BYTES` – rotate log files at this size (`5000000`)
- `LOG_RETENTION_DAYS` – delete old logs after days (`30`)

### Web UI Configuration

The UI automatically detects your BeeperMCP server and connects to live data streams. Configuration options:

```bash
# Theme customization
./beepermcp ui --theme dark      # Dark theme (default)
./beepermcp ui --theme light     # Light theme  
./beepermcp ui --theme auto      # Follow system preference

# Performance tuning
./beepermcp ui --update-interval 5000    # Update every 5 seconds
./beepermcp ui --max-messages 1000       # Limit message history
./beepermcp ui --enable-animations       # Smooth animations (default)

# Data filtering  
./beepermcp ui --rooms "general,dev"     # Specific rooms only
./beepermcp ui --timeframe "7d"          # Last 7 days
./beepermcp ui --participants "alice,bob" # Specific users
```

## Troubleshooting

### Web UI Issues

**UI won't load:**
```bash
# Check server status
./beepermcp status

# Restart with UI enabled
./beepermcp restart --ui

# Check logs
./beepermcp logs --ui
```

**Connection problems:**
```bash
# Verify configuration
./beepermcp config show

# Test API connectivity  
./beepermcp test-api

# Reset UI cache
./beepermcp ui --reset-cache
```

**Performance issues:**
```bash
# Enable debug mode
./beepermcp ui --debug

# Reduce update frequency
./beepermcp ui --update-interval 10000

# Disable animations
./beepermcp ui --no-animations
```

### Matrix Sync Issues

**Failed syncs:**
```bash
# Remove session cache to force resync
rm -f ~/.BeeperMCP/mx-cache/session.json
./beepermcp server
```

**Key decryption problems:**
```bash
# Use phased setup for debugging
./beepermcp setup --verbose

# Check key backup recovery
./beepermcp keys --restore
```

**Corrupted cache:**
```bash
# Reset all caches (keeps configuration)
./beepermcp reset --cache-only

# Complete reset (reconfiguration required)
./beepermcp reset --all
```

## Development

### Setup
```bash
# Install dependencies
npm ci

# Build project
npm run build

# Run tests with coverage
npm run test:coverage

# Start development server with hot reload
npm run dev
```

### Web UI Development
```bash
# Start UI development server
npm run dev:ui

# Build UI for production  
npm run build:ui

# Run UI tests
npm run test:ui
```

### Contributing

We welcome contributions! See our [Contributing Guide](CONTRIBUTING.md) for:
- Code style guidelines
- Testing requirements  
- Pull request process
- Issue reporting

### Documentation

- 📖 **[Web UI Documentation](docs/web-ui.md)** - Complete UI guide
- 🔧 **[API Reference](docs/api.md)** - MCP tools and endpoints
- 🐳 **[Docker Guide](docs/docker.md)** - Container deployment
- 🔐 **[Security Guide](docs/security.md)** - Encryption and best practices

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<div align="center">
  <strong>Made with ❤️ for the Matrix community</strong>
  <br>
  <br>
  <a href="https://matrix.org">
    <img src="https://img.shields.io/badge/Matrix-000000?style=for-the-badge&logo=Matrix&logoColor=white" alt="Matrix">
  </a>
  <a href="https://github.com/openai/modelcontextprotocol">
    <img src="https://img.shields.io/badge/MCP-Compatible-blue?style=for-the-badge" alt="MCP Compatible">
  </a>
</div>