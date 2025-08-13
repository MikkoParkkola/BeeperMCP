# BeeperMCP

BeeperMCP is a small Matrix client wrapper that exposes chats and actions through the [Model Context Protocol](https://github.com/openai/modelcontextprotocol). It is intended for AI clients that support MCP so they can interact with your Beeper-connected accounts. The server syncs your Matrix rooms, decrypts messages using Olm, stores chat logs and media locally and provides an MCP server with tools for listing rooms, reading back messages and sending new ones.

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

## Usage

Create a `.beeper-mcp-server.env` file containing at least `MATRIX_USERID` and `MATRIX_TOKEN` (or `MATRIX_PASSWORD`). You can copy `.beeper-mcp-server.env.example` and edit it, or let the `setup.js` script generate one. If you provide only a password, the generated access token is saved to `mx-cache/session.json` and used automatically on future runs. The server is written in TypeScript so you'll need `ts-node` (installed by `setup.js`) to run it:

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
- `KEY_BACKUP_RECOVERY_KEY` – restore room keys from server backup
- `KEY_REQUEST_INTERVAL_MS` – initial retry delay for missing keys (`1000`)
- `KEY_REQUEST_MAX_INTERVAL_MS` – max retry delay for missing keys (`300000`)
- `MSC4190` / `MSC3202` – enable experimental key-forwarding/device-masquerading (`true`)
- `SESSION_SECRET` – encrypt session cache on disk
- `LOG_SECRET` – encrypt per-room log files
- `MCP_API_KEY` – require this key in tool requests (`_meta.apiKey`)
- `MEDIA_SECRET` – encrypt downloaded media files
- `ENABLE_SEND_MESSAGE` – set to `1` to expose the `send_message` tool
- `TEST_ROOM_ID` – sync only a specific room (empty)
- `TEST_LIMIT` – stop after decrypting N events (`0`)

If `MCP_API_KEY` is set, tool invocations must include this value in `_meta.apiKey`. Requests without the correct key are rejected.

The server will validate your `MATRIX_TOKEN` using the Matrix `/_matrix/client/v3/account/whoami` endpoint before any data is downloaded. If the token does not match the provided `MATRIX_USERID`, the process exits with an error.

The server will begin syncing your rooms and expose an MCP server over STDIO. AI clients can connect using the Model Context Protocol and invoke the provided tools to read or send messages on your behalf.

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
`LOG_LEVEL` to adjust verbosity. Logs rotate when they exceed `LOG_MAX_BYTES`:

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

Install dependencies with `npm install` and use the provided scripts to check formatting, run tests, or lint the code:

```bash
npm run format
npm test
npm run test:coverage
npm run lint
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
