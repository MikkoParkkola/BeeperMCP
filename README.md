# 🧠 BeeperMCP - Revolutionary Relationship Intelligence Hub

<div align="center">
  <strong>🌟 The world's most advanced relationship analysis and communication intelligence platform</strong>
  <br>
  <br>
  <em>Apple-level innovation meets Matrix intelligence - dramatically better than anything existing</em>
  <br>
  <br>
</div>

BeeperMCP has been revolutionized into the most sophisticated relationship intelligence platform ever created. Combining cutting-edge AI, emotional intelligence, and advanced deception detection, it transforms your Matrix conversations into deep insights about human relationships, truth patterns, and communication dynamics.

## 🚀 Getting Started

### ⚡ **Instant Setup**

```bash
# 1. Download BeeperMCP
curl -L https://github.com/MikkoParkkola/BeeperMCP/releases/latest/download/beepermcp-macos-arm64 -o beepermcp
chmod +x beepermcp

# 2. Launch revolutionary interface
./beepermcp ui

# 3. Experience the future of relationship intelligence!
```

## 🛠 Build & Test (Quickstart)

- Requirements: Node.js 22+, npm 10+ (or newer).
- Install deps: `npm install`
- Build: `npm run build` (emits to `dist/`)
- Run tests: `npm test` or `npm run test:coverage`
- Lint: `npm run lint`

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

- **[Features](docs/FEATURES.md)**: A comprehensive overview of all features.
- **[Agent & Technical Documentation](AGENTS.md)**: In-depth technical documentation for agents and contributors.
- **[Roadmap & Backlog](REFINED_BACKLOG_2025.md)**: The project's roadmap and detailed backlog.
- **[Chat TUI — Vision & Plan](docs/TUI-CHAT.md)**: Vision, UX, and implementation plan for a user-friendly terminal UI.

<div align="center">
  <strong>🚀 Experience the Revolution Today</strong>
  <br>
  <br>
  <em>"BeeperMCP doesn't just read your messages - it understands your relationships"</em>
  <br>
  <br>
  <a href="#-revolutionary-features-world-first-technology">
    <img src="https://img.shields.io/badge/Revolutionary-Intelligence-gold?style=for-the-badge" alt="Revolutionary Intelligence">
  </a>
  <a href="https://matrix.org">
    <img src="https://img.shields.io/badge/Matrix-Compatible-000000?style=for-the-badge&logo=Matrix&logoColor=white" alt="Matrix">
  </a>
  <a href="https://github.com/openai/modelcontextprotocol">
    <img src="https://img.shields.io/badge/MCP-Enhanced-blue?style=for-the-badge" alt="MCP Enhanced">
  </a>
</div>
