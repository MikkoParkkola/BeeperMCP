# Module and Function Interfaces

This document summarizes the primary modules and functions, their parameters, return values, and expected behaviors to allow parallel development.

## Packaging and Entry

- `src/bin.ts`
  - `main(): Promise<void>`
    - Parses `process.argv[2]` as `chat | server | update` (default: `chat`).
    - `chat` → dynamic import `./cli/chat.js` (runs the CLI loop).
    - `server` → sets `MCP_STDIO_MODE=1`, imports `./server.js`, calls `startServer()`.
    - `update` → calls `maybeAutoUpdate({ force: true })` and prints result.
    - On every run, triggers background `maybeAutoUpdate({ force: false })` (no blocking).

- `src/pack/bootstrap.ts`
  - `initPackBootstrap(): void`
    - If `process.pkg` exists (pkg binary), extracts native modules to `~/.BeeperMCP/native/<nodeVer>/node_modules` and prepends that path to module resolution.
    - Auto-executes on import.

## Auto‑Update

- `src/update/autoUpdate.ts`
  - `maybeAutoUpdate(opts?: { force?: boolean }): Promise<{ replaced: boolean; reason?: string }>`
    - Detects packaged mode. Determines platform tag: `macos-x64 | linux-x64 | win-x64`.
    - Resolves `owner/repo` from `BEEPERMCP_UPDATE_REPO` or `package.json.repository`.
    - Skips if recently checked (24h) unless `force` is true.
    - Fetches latest release, selects `beepermcp-<tag>[.exe]`, downloads to `~/.BeeperMCP/tmp`, validates SHA‑256 via `manifest.json` if present.
    - Replaces `process.execPath` atomically on POSIX; stages `*.new.exe` on Windows.

## MCP Server Surfaces

- `mcp-tools.js`
  - `buildMcpServer(client, logDb, enableSend, apiKey?, logSecret?, queryFn = queryLogs): McpServer`
    - Registers tools: `list_rooms`, `create_room`, `list_messages`, optional `send_message`.
    - Registers wrappers to enforce API key scopes on `tools/*` and `resources/*` when `apiKey` is provided; disabled if `apiKey` is falsy (STDIO mode).

- `src/mcp-server.ts`
  - `createMcpServer(client, logDb, enableSend, apiKey?, logSecret?): Promise<McpServer>`
    - In HTTP mode, requires `apiKey`. In STDIO, passes `undefined` to disable enforcement.
  - `startStdioServer(client, logDb, enableSend?, logSecret?): Promise<McpServer>`
    - Starts a STDIO transport with version negotiation logging; returns the `McpServer`.
  - `startHttpServer(client, logDb, enableSend, apiKey, logSecret?, port?): Promise<{ mcpServer: McpServer; httpServer: http.Server }>`
    - Starts Streamable HTTP server and exposes `/.well-known/mcp.json`.

- `src/mcp.ts`
  - `initMcpServer(client, logDb, enableSend, apiKey, logSecret, port?): Promise<{ mcpServer: McpServer; httpServer: http.Server }>`
    - Registers `resources/list` and `resources/read` handlers with API key gating and metrics.

- `src/server.ts`
  - `startServer(): Promise<void>`
    - Loads env (prefers `~/.BeeperMCP/.beeper-mcp-server.env`, then CWD).
    - Ensures `~/.BeeperMCP`, `mx-cache`, `room-logs` exist; creates Matrix client; starts STDIO or HTTP server depending on env.

## Resources API

- `src/mcp/resources.ts`
  - Types: `ResourceHandler = (params: Record<string,string>, query: URLSearchParams, owner: string) => Promise<any>`
  - `registerResources(logDb?: any, logSecret?: string): void`
    - Binds SQLite DB and secret; idempotent route registration.
    - Routes:
      - `im://matrix/room/:roomId/history?from&to&limit&lang`
      - `im://matrix/room/:roomId/message/:eventId/context?before&after`
      - `im://matrix/media/:eventId/:kind`
      - `im://matrix/index/status`
  - `listResources(): string[]` → Returns registered resource templates.
  - `handleResource(uri: string, query: URLSearchParams, owner: string): Promise<any>` → Dispatches by URI pattern.

## Security

- `src/security/rateLimit.ts`
  - `rateLimiter(name: string, ratePerMinute: number): void`
    - Token bucket per `name`; throws `Error("rate_limited:<name>")` if budget exhausted.
  - `__resetRateLimiter(name?: string): void` (test helper).

- `src/security/guardrails.ts`
  - `checkGuardrails(text: string, asUser?: string): { ok: boolean; reason?: 'do_not_impersonate' | 'blocked_keyword' }`
    - Blocks impersonation and regex‑listed keywords.

- `src/security/sanitize.ts`
  - `sanitizeText(input: string): string` → Strips HTML, collapses whitespace, clamps to 4000 chars.

## Utilities (SQLite, Files, Media)

- `utils.js`
  - Files/paths: `ensureDir(dir)`, `safeFilename(s)`, `getRoomDir(base, roomId)`, `envFlag(name, def)`.
  - Crypto: `encrypt(data, secret)`, `decrypt(data, secret)`, `encryptFileStream(src, dest, secret)`, `decryptFile(file, secret)`.
  - Logs: `tailFile(file, limit, secret)`, `appendWithRotate(file, line, maxBytes, secret)`, `createFileAppender(file, maxBytes, secret, flushMs?, maxEntries?)`.
  - SQLite: `openLogDb(file)`, `createLogWriter(db, secret, flushMs?, maxEntries?)`, `insertLogs(db, entries, secret)`, `insertLog(...)`, `queryLogs(db, roomId, limit?, since?, until?, secret?)`.
  - Media: `insertMedia(db, meta)`, `insertMedias(db, entries)`, `queryMedia(db, roomId, limit?)`, `createMediaWriter(db, flushMs?, maxEntries?)`, `createMediaDownloader(db, queueMedia, queueLog, secret, concurrency?)`.
  - Misc: `pushWithLimit(arr, val, limit)`, `BoundedMap<K,V>(limit)`, `FileSessionStore(file, secret?, flushMs?)`, `createFlushHelper()`.

## Config

- `src/config.ts` and `src/config/runtime.ts`
  - `loadConfig(): LocalConfig | RuntimeConfig`
    - Prefers `~/.BeeperMCP/.beeper-mcp-server.env`, then project `.beeper-mcp-server.env`.
    - Defaults `MATRIX_CACHE_DIR=~/.BeeperMCP/mx-cache`, `MESSAGE_LOG_DIR=~/.BeeperMCP/room-logs`, `LOG_DB_PATH=<logDir>/messages.db`.
  - `config` (analytics) constant: connection settings for analytics tools and Postgres.

## Chat CLI

- `src/cli/chat.ts` (auto‑run module)
  - Persistent config `~/.BeeperMCP/config.json`:
    - `{ providers: Record<string, ProviderConfig>, active?: { provider?: string; model?: string }, settings?: Record<string, unknown> }`
    - ProviderConfig variants:
      - OpenAI `{ type:'openai', name, apiKey, baseUrl? }`
      - Anthropic `{ type:'anthropic', name, apiKey, baseUrl? }`
      - OpenRouter `{ type:'openrouter', name, apiKey, baseUrl? }`
      - Ollama `{ type:'ollama', name, host }`
  - Internal helpers (can be imported if needed):
    - `configureProvider(cfg)`, `listModelsForProvider(p)`, `sendChat(p, model, messages)`.
  - Commands: `/help`, `/providers`, `/add`, `/models`, `/switch`, `/version`, `/update`, `/set key value`, `/config`, `/quit`.
  - New Commands: `/digest [hours]`, `/qa <question>`, `/reply`, `/triage`, `/inbox`, `/open <n>`, `/todo`, `/brief <room>`, `/persona <room>`.

## Analytics Tools (MCP)

- Registered via `mcp-tools.js`; tool IDs and inputs:
  - `list_rooms`: `{ limit?: number }` → `[{ room_id, name }]`
  - `create_room`: `{ name: string, encrypted?: boolean }` → `{ room_id }`
  - `list_messages`: `{ room_id: string, limit?: number, since?: string, until?: string }` → `string[]` (logs)
  - `send_message` (when enabled): `{ room_id: string, message: string }` → `'sent'`
  - Postgres analytics modules (if present in src/mcp/tools/\*\*): follow their individual JSON schemas and push filters to SQL.

## Matrix Client

- The server constructs a `MatrixClient` from `matrix-js-sdk` using `MATRIX_USERID`, `MATRIX_TOKEN`, optional `deviceId` (from `~/.BeeperMCP/mx-cache/session.json`), and runs operations for `list_rooms`, `create_room`, and optional `send_message`.

## HTTP Discovery

- `/.well-known/mcp.json` served by HTTP server with `{ name, version, transport, protocolVersions[], defaultProtocolVersion }`.

## Release Artifacts

- CI builds x64 binaries with names:
  - `beepermcp-macos-x64`, `beepermcp-linux-x64`, `beepermcp-win-x64.exe`
  - `checksums.txt` (SHA‑256), `manifest.json` (version + assets)
