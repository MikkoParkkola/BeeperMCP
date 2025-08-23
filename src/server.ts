import dotenv from 'dotenv';
dotenv.config({ path: '.beeper-mcp-server.env' });
import sdk from 'matrix-js-sdk';
import fs from 'fs';
import path from 'path';

const HS = process.env.MATRIX_HOMESERVER ?? 'https://matrix.beeper.com';
const UID = process.env.MATRIX_USERID;
const TOKEN = process.env.MATRIX_TOKEN;
const CACHE_DIR = process.env.MATRIX_CACHE_DIR ?? './mx-cache';

export async function startServer() {
  console.log('Starting Beeper MCP server...');

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
    console.warn('Failed to load session data:', e);
  }

  // Generate a new device ID if we don't have one
  if (!deviceId) {
    deviceId = Math.random().toString(36).substring(2, 12);
  }

  console.log('Creating Matrix client...');
  const client = sdk.createClient({
    baseUrl: HS,
    userId: UID,
    accessToken: TOKEN,
    deviceId: deviceId,
  });

  try {
    console.log('Verifying access token...');
    const whoami = await client.whoami();
    console.log('Authenticated as:', whoami.user_id);

    console.log('Server is ready!');

    // Keep the process running
    setInterval(() => {
      console.log('Server running...');
    }, 60000);

    return client;
  } catch (e) {
    console.error('Failed to start server:', e);
    throw e;
  }
}
