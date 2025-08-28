# 🧠 BeeperMCP - Your Personal Conversation Intelligence Hub

<div align="center">
  <strong>The world's most advanced Matrix client, powered by local-first AI.</strong>
  <br>
  <br>
  <em>BeeperMCP doesn't just read your messages - it understands your conversations.</em>
  <br>
  <br>
</div>

BeeperMCP is a revolutionary Matrix client that uses local-first AI to provide deep insights into your conversations. It combines cutting-edge machine learning, emotional intelligence, and advanced analysis to transform your Matrix chats into a powerful tool for understanding communication dynamics.

## 🚀 Getting Started

### ⚡ **Instant Setup**

```bash
# 1. Download BeeperMCP
curl -L https://github.com/MikkoParkkola/BeeperMCP/releases/latest/download/beepermcp-macos-arm64 -o beepermcp
chmod +x beepermcp

# 2. Run the interactive chat CLI
./beepermcp chat
```

## 🛠 Build & Test (for Developers)

- **Requirements**: Node.js 22+, npm 10+
- **Install dependencies**: `npm install`
- **Build**: `npm run build` (output to `dist/`)
- **Run tests**: `npm test`
- **Lint**: `npm run lint`

## 📦 Single Executable (SEA)

Build single-file binaries using Node's official Single Executable Applications (SEA).

- Requirements: Node 22+; `postject` is already in devDependencies.
- macOS local build:
  - `rm -rf build sea-prep.blob sea-config.json`
  - `npm ci && npm run make:macos:sea`
  - Run: `./build/beepermcp.sea.run chat|tui|server|ui`
- Linux/Windows local build:
  - Linux: `npm run make:linux:sea` → `build/beepermcp.sea.run`
  - Windows: `npm run make:windows:sea` → `build\\beepermcp.sea.run.exe`
- Notes: Uses a tiny CJS shim to import the ESM CLI; macOS build clears xattrs and applies ad‑hoc codesign.

CI releases

- Tags (`v*.*.*`): GitHub Actions builds SEA binaries for macOS/Linux/Windows and publishes archives named `agentsmcp-<os>-<arch>` with checksums and a manifest (optional signature).
- Pushes to `main`: A prerelease is published with the same artifacts.
- macOS: pkg is default; SEA is experimental (may be unstable on some systems).

## 🧰 CLI & TUI

- Chat CLI: `beepermcp chat`
- TUI Inbox: `beepermcp tui`
- Server (stdio): `beepermcp server`
- Web UI launcher: `beepermcp ui`

TUI shortcuts:

- Up/Down or j/k: navigate inbox
- Enter: generate drafts for selected item
- a: accept and send
- s: snooze 2h
- x: dismiss
- r: refresh inbox
- q: quit

## 📖 Documentation

- See repository for usage examples and CI workflows.

<div align="center">
  <a href="https://matrix.org">
    <img src="https://img.shields.io/badge/Matrix-Compatible-000000?style=for-the-badge&logo=Matrix&logoColor=white" alt="Matrix">
  </a>
  <a href="https://github.com/model-context-protocol/specification">
    <img src="https://img.shields.io/badge/MCP-Enhanced-blue?style=for-the-badge" alt="MCP Enhanced">
  </a>
</div>
