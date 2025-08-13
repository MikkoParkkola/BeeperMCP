# BeeperMCP

BeeperMCP is a small Matrix client wrapper that exposes chats and actions through the [Model Context Protocol](https://github.com/openai/modelcontextprotocol). It is intended for AI clients that support MCP so they can interact with your Beeper-connected accounts. The server syncs your Matrix rooms, decrypts messages using Olm, stores chat logs and media locally and provides an MCP server with tools for listing rooms, reading back messages and sending new ones.

## Features

- Syncs events from your Beeper homeserver
- Decrypts end-to-end encrypted rooms
- Stores message history and media per room with optional SQLite indexing
- Provides MCP tools: `list_rooms`, `create_room`, `list_messages`, `send_message`
- Graceful shutdown and local caching of sync tokens and room keys

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

   The script tries to detect your Matrix homeserver, user ID and access token from Beeper/Element configuration. Any missing values are prompted on the command line and written to `.beeper-mcp-server.env` for future runs.

## Usage

Create a `.beeper-mcp-server.env` file containing at least `MATRIX_USERID` and `MATRIX_TOKEN` (or `MATRIX_PASSWORD`). You can copy `.beeper-mcp-server.env.example` and edit it, or let the `setup.js` script generate one. If you provide only a password, the generated access token is saved to `mx-cache/session.json` and used automatically on future runs. The server is written in TypeScript so you'll need `ts-node` (installed by `setup.js`) to run it:

```bash
npx ts-node beeper-mcp-server.ts
```

Optional variables include `MATRIX_HOMESERVER`, `MESSAGE_LOG_DIR`, `MATRIX_CACHE_DIR`, `LOG_LEVEL`, `MSC3202`, `MSC4190` and more (see the source file for details). Support for the MSC3202 device-masquerading and MSC4190 key-forwarding extensions is enabled by default. Set `MSC3202=false` or `MSC4190=false` to opt out. These can also be placed in `.beeper-mcp-server.env`.
`LOG_MAX_BYTES` controls the maximum size of each room log before it is rotated (default `5000000` bytes).
`KEY_REQUEST_INTERVAL_MS` sets the initial delay before a missing room key is re-requested (default `1000` ms). `KEY_REQUEST_MAX_INTERVAL_MS` limits the maximum delay between requests (default `300000` ms). The delay doubles after each failed attempt until the maximum is reached.
`SESSION_SECRET` encrypts the session cache on disk when set.
`LOG_SECRET` encrypts per-room log files when set.
`LOG_DB_PATH` points to a SQLite database used to index logs for efficient queries (default `room-logs/messages.db`).

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

## Development

Install dependencies with `npm install` and use the provided scripts to run tests, check coverage, or lint the code:

```bash
npm test
npm run test:coverage
npm run lint
```

The test suite currently exercises the utility helpers and runs with Node's built-in test runner.

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
