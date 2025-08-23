import dotenv from 'dotenv';
dotenv.config({ path: '.beeper-mcp-server.env' });
import sdk from 'matrix-js-sdk';
import fs from 'fs';
import path from 'path';
import { startStdioServer, startHttpServer } from './mcp-server.js';
import { isStdioMode } from './mcp-compat.js';

const HS = process.env.MATRIX_HOMESERVER ?? 'https://matrix.beeper.com';
const UID = process.env.MATRIX_USERID;
const TOKEN = process.env.MATRIX_TOKEN;
const CACHE_DIR = process.env.MATRIX_CACHE_DIR ?? './mx-cache';
const ENABLE_SEND = process.env.ENABLE_SEND_MESSAGE === '1';
const API_KEY = process.env.MCP_API_KEY || (isStdioMode() ? 'local-stdio-mode' : undefined);
const PORT = parseInt(process.env.MCP_SERVER_PORT || '3000');

export async function startServer() {
  console.error('Starting Beeper MCP server...');

  if (!UID) throw new Error('MATRIX_USERID is required');
  if (!TOKEN) throw new Error('MATRIX_TOKEN is required');

  // Ensure cache directory exists
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }

  // Load device ID from session if available
  let deviceId = null;
  try {
    const sessionFile = path.join(CACHE_DIR, 'session.json');
    if (fs.existsSync(sessionFile)) {
      const sessionData = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
      deviceId = sessionData.deviceId;
    }
  } catch (e) {
    console.error('Failed to load session data:', e);
  }

  // Generate a new device ID if we don't have one
  if (!deviceId) {
    deviceId = Math.random().toString(36).substring(2, 12);
  }

  console.error('Creating Matrix client...');
  const client = sdk.createClient({
    baseUrl: HS,
    userId: UID,
    accessToken: TOKEN,
    deviceId: deviceId,
  });

  try {
    console.error('Verifying access token...');
    const whoami = await client.whoami();
    console.error('Authenticated as:', whoami.user_id);

    // Mock database for now (replace with actual implementation)
    const logDb = null;

    // Determine mode and start appropriate server
    if (isStdioMode() || process.env.MCP_STDIO_MODE === '1') {
      console.error('Starting in STDIO mode for MCP clients...');
      return await startStdioServer(client, logDb, ENABLE_SEND);
    } else {
      console.error(`Starting in HTTP mode on port ${PORT}...`);
      if (!API_KEY) {
        throw new Error('MCP_API_KEY is required for HTTP mode');
      }
      return await startHttpServer(client, logDb, ENABLE_SEND, API_KEY, undefined, PORT);
    }
  } catch (e) {
    console.error('Failed to start server:', e);
    throw e;
  }
}
