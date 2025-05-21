# BeeperMCP

BeeperMCP is a small Matrix client wrapper that exposes chats and actions through the [Model Context Protocol](https://github.com/openai/modelcontextprotocol). It is intended for AI clients that support MCP so they can interact with your Beeper-connected accounts. The server syncs your Matrix rooms, decrypts messages using Olm, stores chat logs and media locally and provides an MCP server with tools for listing rooms, reading back messages and sending new ones.

## Features

- Syncs events from your Beeper homeserver
- Decrypts end-to-end encrypted rooms
- Stores message history and media per room
- Provides MCP tools: `list_rooms`, `create_room`, `list_messages`, `send_message`
- Graceful shutdown and local caching of sync tokens and room keys

## Usage

Set the required environment variables and run the server with Node:

```bash
MATRIX_USERID="@you:beeper.com" \
MATRIX_TOKEN="YOUR_ACCESS_TOKEN" \
node beeper-mcp-server.ts
```

Optional variables include `MATRIX_HOMESERVER`, `MESSAGE_LOG_DIR`, `MATRIX_CACHE_DIR`, `LOG_LEVEL` and more (see the source file for details).

The server will begin syncing your rooms and expose an MCP server over STDIO. AI clients can connect using the Model Context Protocol and invoke the provided tools to read or send messages on your behalf.

## Development

Unit tests for the small utility helpers are provided in `test/utils.test.js` and can be executed with:

```bash
node --test test/utils.test.js
```

No external dependencies are required for the tests.
