# BeeperMCP

BeeperMCP is a small Matrix client wrapper that exposes chats and actions through the [Model Context Protocol](https://github.com/openai/modelcontextprotocol). It is intended for AI clients that support MCP so they can interact with your Beeper-connected accounts. The server syncs your Matrix rooms, decrypts messages using Olm, stores chat logs and media locally and provides an MCP server with tools for listing rooms, reading back messages and sending new ones.

## Features

- Syncs events from your Beeper homeserver
- Decrypts end-to-end encrypted rooms
- Stores message history and media per room
- Provides MCP tools: `list_rooms`, `create_room`, `list_messages`, `send_message`
- Graceful shutdown and local caching of sync tokens and room keys

## Quick setup (macOS)

1. Clone the repository and move into it:

   ```bash
   git clone <repo-url>
   cd BeeperMCP
   ```

2. Run the interactive setup script which installs dependencies, creates `.beeper-mcp-server.env` and performs the phased setup:

   ```bash
   node setup.js
   ```

   The script tries to detect your Matrix homeserver, user ID and access token from Beeper/Element configuration. Any missing values are prompted on the command line and written to `.beeper-mcp-server.env` for future runs.

## Usage

Create a `.beeper-mcp-server.env` file containing at least `MATRIX_USERID` and `MATRIX_TOKEN` (or `MATRIX_PASSWORD`). The `setup.js` script creates this automatically. Then run the server with Node:

```bash
node beeper-mcp-server.ts
```

Optional variables include `MATRIX_HOMESERVER`, `MESSAGE_LOG_DIR`, `MATRIX_CACHE_DIR`, `LOG_LEVEL` and more (see the source file for details). These can also be placed in `.beeper-mcp-server.env`.

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

Unit tests for the small utility helpers are provided in `test/utils.test.js` and can be executed with:

```bash
node --test test/utils.test.js
```

No external dependencies are required for the tests.
