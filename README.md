# BeeperMCP

BeeperMCP is a small Matrix client wrapper that exposes chats and actions through the [Model Context Protocol](https://github.com/openai/modelcontextprotocol). It is intended for AI clients that support MCP so they can interact with your Beeper-connected accounts. The server syncs your Matrix rooms, decrypts messages using Olm, stores chat logs and media locally and provides an MCP server with tools for listing rooms, reading back messages and sending new ones.

This line was added as a CI test commit.

## Features

- Syncs events from your Beeper homeserver
- Decrypts end-to-end encrypted rooms
- Stores message history and media per room with optional SQLite indexing and metadata tracking
- Provides MCP tools: `list_rooms`, `create_room`, `list_messages`, and optionally `send_message`
- Graceful shutdown and local caching of sync tokens and room keys
- Writes caches and logs with owner-only file permissions

## Quick setup (macOS)

1. Clone the repository and move into it:

   ```bash
   git clone <repo-url>
   cd BeeperMCP
   ```

2. Copy the sample environment file and edit it with your homeserver and credentials:

   ```bash
   cp .beeper-mcp-server.env.example .beeper-mcp-server.env
   $EDITOR .beeper-mcp-server.env
   ```

3. Run the interactive setup script which installs dependencies, validates the env file and performs the phased setup:

   ```bash
   node setup.js
   ```

   The script attempts to detect your Matrix homeserver, user ID and access token from Beeper/Element configuration. Prompts are validated to ensure a proper homeserver URL, user ID, and either an access token or password before saving to `.beeper-mcp-server.env`. It also offers to encrypt the session cache and room logs, configure log rotation size, and optionally enable the `send_message` tool.

## Docker deployment

The repository includes a multi-stage Dockerfile suitable for local or multi-tenant hosting. The runtime image runs as the built-in `node` user and stores state under `/app/mx-cache` and `/app/room-logs`.

Build the image:

```bash
docker build -t beeper-mcp .
```

Alternatively, use the helper script to tag the image with the package
version and release date (requires `jq`):

```bash
bash scripts/build_docker.sh
```

Pre-built images are published to GitHub Container Registry on each push to
`main` and for version tags. Replace `<owner>` with the repository owner and
pull the image directly:

```bash
docker pull ghcr.io/<owner>/beepermcp:latest
# or a specific version
docker pull ghcr.io/<owner>/beepermcp:v1.2.3
```

Run the container with isolated volumes and your environment file:

```bash
docker run -p 8757:8757 -p 3000:3000 \
  -v mcp-cache:/app/mx-cache -v mcp-logs:/app/room-logs \
  --env-file .beeper-mcp-server.env beeper-mcp
```

For multi-tenant deployments, start a separate container per user with distinct volumes and environment files.

## Usage

Create a `.beeper-mcp-server.env` file containing at least `MATRIX_USERID` and `MATRIX_TOKEN` (or `MATRIX_PASSWORD`). You can copy `.beeper-mcp-server.env.example` and edit it, or let the `setup.js` script generate one. If you provide only a password, the generated access token is saved to `~/.BeeperMCP/mx-cache/session.json` and used automatically on future runs. The server is written in TypeScript so you'll need `ts-node` (installed by `setup.js`) to run it:

```bash
npx ts-node beeper-mcp-server.ts
```

Common optional variables are shown below (defaults in parentheses):

- `MATRIX_HOMESERVER` – homeserver URL (`https://matrix.beeper.com`)
- `MESSAGE_LOG_DIR` – directory for room logs (`./room-logs`)
- `LOG_DB_PATH` – SQLite database for indexed logs and media metadata with WAL and batched writes (`room-logs/messages.db`)
- `LOG_LEVEL` – log verbosity: `trace`, `debug`, `info`, `warn`, or `error` (`info`)
- `BACKFILL_CONCURRENCY` – simultaneous backfill requests (`5`)
- `LOG_MAX_BYTES` – rotate log files when they exceed this size (`5000000`)
- `LOG_RETENTION_DAYS` – delete rotated log files and prune old log/media entries (`30`)
- `KEY_BACKUP_RECOVERY_KEY` – restore room keys from server backup
- `KEY_REQUEST_INTERVAL_MS` – initial retry delay for missing keys (`1000`)
- `KEY_REQUEST_MAX_INTERVAL_MS` – max retry delay for missing keys (`300000`)
- `MSC4190` / `MSC3202` – enable experimental key-forwarding/device-masquerading (`true`)
- `SESSION_SECRET` – encrypt session cache on disk
- `LOG_SECRET` – encrypt per-room log files
- `MEDIA_SECRET` – encrypt downloaded media files
- `ENABLE_SEND_MESSAGE` – set to `1` to expose the `send_message` tool
- `TEST_ROOM_ID` – sync only a specific room (empty)
- `TEST_LIMIT` – stop after decrypting N events (`0`)

HTTP mode checks `_meta.apiKey` against `MCP_API_KEY` on every MCP request. STDIO mode does not require an API key.

The server will validate your `MATRIX_TOKEN` using the Matrix `/_matrix/client/v3/account/whoami` endpoint before any data is downloaded. If the token does not match the provided `MATRIX_USERID`, the process exits with an error.

The server will begin syncing your rooms and expose an MCP server over STDIO. AI clients can connect using the Model Context Protocol and invoke the provided tools to read or send messages on your behalf.

## Binary downloads

Prebuilt, single-file binaries are published on every tagged release (x64 only):

Replace `owner/repo` with your repository path. Example URLs:

- macOS (x64): https://github.com/MikkoParkkola/BeeperMCP/releases/latest/download/beepermcp-macos-x64
- Linux (x64): https://github.com/MikkoParkkola/BeeperMCP/releases/latest/download/beepermcp-linux-x64
- Windows (x64): https://github.com/MikkoParkkola/BeeperMCP/releases/latest/download/beepermcp-win-x64.exe

The binaries are self-contained and persist all state under `~/.BeeperMCP` by default.

Verify checksum (optional):

```
curl -sSLO https://github.com/MikkoParkkola/BeeperMCP/releases/latest/download/checksums.txt
shasum -a 256 -c checksums.txt | grep beepermcp-macos-x64
```

### Running the binary

- Chat UI: `./beepermcp` or `./beepermcp chat`
- MCP STDIO server: `./beepermcp server`

First run prompts for provider configuration and persists it to `~/.BeeperMCP/config.json`. Subsequent runs are instant.

### Auto‑update

The binary periodically checks for updates and can self-update:

- Force update now: `./beepermcp update`
- Auto-check runs once per day at startup. On macOS/Linux, the binary is replaced atomically. On Windows, a new file `beepermcp.exe.new` is staged and swapped on next start.

To enable update checks, set the update source to your GitHub repo:

```
export BEEPERMCP_UPDATE_REPO=MikkoParkkola/BeeperMCP
```

If this variable is not set but the `repository` field in `package.json` points to a GitHub URL, it will be used automatically.

Pre‑releases attached on each push to `main` are available under the Releases page (marked as prerelease). They include the same assets plus a `manifest.json` and `checksums.txt` for verification. The auto‑updater prefers the `manifest.json` asset to validate downloads.

### Fetch tool

The `fetch` tool retrieves remote content over HTTP(S) or Matrix MXC URLs. It only allows `GET` (default) and `HEAD` requests; other methods will be rejected.

```json
{
  "id": "fetch",
  "input": { "url": "https://example.com/data.json" }
}
```

MXC URLs resolve through the configured homeserver and include your access token when needed:

```json
{
  "id": "fetch",
  "input": { "url": "mxc://server/id" }
}
```

### Metrics endpoint

When running the HTTP MCP server (via `src/mcp.ts`), a read-only metrics endpoint is exposed:

```
GET /metrics  ->  { counters: { ... }, rates: { ... } }
GET /metrics?verbose=1  ->  adds durations { sum_ms, count, avg_ms } and simple histograms
```

These counters provide basic observability for E2EE decryption and key request activity.

### Phased setup

For troubleshooting new device registration and key import, the repository
includes a helper script `phased-setup.ts`. It performs the startup sequence in
distinct steps and aborts if a step fails:

1. **Login/Register** – logs in with `MATRIX_PASSWORD` when no token is
   available and stores the resulting device ID and token.
2. **Load cache** – prepares the local cache and optionally removes any existing
   plain-text logs when `DELETE_PLAINTEXT_LOGS=true` is set.
3. **Restore keys** – initialises the crypto engine and imports room keys from
   backup files or the server.
4. **Sync** – connects to the homeserver and begins decrypting events.

Run it with the same environment variables as the main server. Each phase
prints progress to the console and exits on error so issues can be diagnosed
easily.

## Troubleshooting

### Recovering from failed syncs

Occasional network hiccups or corrupted state can leave the client stuck
mid-sync. Restarting the process will automatically resume using the last
stored sync token. If the error persists, remove the `session.json` file in
`mx-cache` to force a full resync:

```bash
rm -f mx-cache/session.json
npx ts-node beeper-mcp-server.ts
```

For stubborn cases, run `phased-setup.ts` to step through login, cache
loading, key restoration and initial sync one phase at a time.

### Resetting caches

If logs or cache files become corrupted, stop the server and remove the cache
directory. This clears stored sync tokens, room keys and downloaded media:

```bash
rm -rf mx-cache room-logs
```

To start fresh while keeping secrets, regenerate them with the setup script or
leave `SESSION_SECRET`, `LOG_SECRET` and `MEDIA_SECRET` unset to disable
encryption.

### Interpreting log messages

Log files are written per room with lines prefixed by ISO timestamps. Use
`LOG_LEVEL` to adjust verbosity. Logs rotate when they exceed `LOG_MAX_BYTES`,
and old rotated files and database entries are pruned after
`LOG_RETENTION_DAYS` days:

```bash
LOG_MAX_BYTES=1000000 npx ts-node beeper-mcp-server.ts
```

Encryption can be enabled or disabled per storage type by setting or omitting
secrets:

```bash
# enable encryption
SESSION_SECRET=mysessionsecret LOG_SECRET=mylogsecret MEDIA_SECRET=myfilesec npx ts-node beeper-mcp-server.ts

# disable encryption
unset SESSION_SECRET LOG_SECRET MEDIA_SECRET
npx ts-node beeper-mcp-server.ts
```

When a SQLite log database is used, WAL mode is enabled by default for better
concurrency. You can verify or change the mode using `sqlite3`:

```bash
sqlite3 room-logs/messages.db 'PRAGMA journal_mode=WAL;'
sqlite3 room-logs/messages.db 'PRAGMA journal_mode=DELETE;' # disable WAL
```

## Development

Install dependencies with `npm ci` and use the provided scripts to build, run tests (compiled), or lint the code:

```bash
npm run build
npm test
npm run test:coverage
npm run lint

### RAG & Search

- Embeddings: deterministic feature-hash embeddings filled into `messages.embedding` (pgvector) using `runReembedBatch(limit)`.
- Vector search: set `SEARCH_MODE=vector` to use ANN `<->` over `embedding`; default is BM25 with phrase support when quoted.

### GHCR Docker Image

- Publish: create a tag `vX.Y.Z` on `main`. The `Publish Docker image` workflow builds and pushes `ghcr.io/<owner>/beepermcp` with `:vX.Y.Z` and `:latest`.
- Manual: run the workflow via `workflow_dispatch` and pass `version`.
```

Pre-commit hooks run these checks automatically. The test suite currently exercises the utility helpers and runs with Node's built-in test runner. Coverage reports exclude the interactive `setup.js` script and enforce an 80% threshold on the remaining code.

## Synapse configuration for self-key requests

When the client requests missing room keys, Synapse normally ignores requests
from the same device. This can lead to an endless key request loop. Starting
with Synapse support for [MSC3202](https://github.com/matrix-org/matrix-doc/pull/3202)
and [MSC4190](https://github.com/matrix-org/matrix-doc/pull/4190), the server
can "masquerade" to-device messages as coming from a separate device so those
requests are honoured.

Enable the following options in your `homeserver.yaml` and restart Synapse:

```yaml
experimental_features:
  msc3202_device_masquerading: true
  msc4190_send_to_device: true
```

If your homeserver supports these features, the client will automatically advertise MSC3202 and MSC4190 support. Set `MSC3202=false` or `MSC4190=false` to disable this behaviour. After enabling these experimental features the bridge will receive keys for its own requests and encrypted rooms will decrypt normally.
