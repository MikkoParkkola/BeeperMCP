import dotenv from 'dotenv';
dotenv.config({ path: '.beeper-mcp-server.env' });
import sdk from 'matrix-js-sdk';
import fs from 'fs';
import path from 'path';
import { ensureDir } from './utils.js';

const HS = process.env.MATRIX_HOMESERVER ?? 'https://matrix.beeper.com';
const UID = process.env.MATRIX_USERID;
const PASSWORD = process.env.MATRIX_PASSWORD;

async function testLogin() {
  console.log('Testing login with password...');

  if (!UID) throw new Error('MATRIX_USERID is required');
  if (!PASSWORD) throw new Error('MATRIX_PASSWORD is required');

  ensureDir('./mx-cache');
  const deviceId = Math.random().toString(36).substring(2, 12);
  const client = sdk.createClient({
    baseUrl: HS,
    userId: UID,
    deviceId,
    useAuthorizationHeader: true,
  });

  try {
    console.log('Attempting to login...');
    const res = await client.login('m.login.password', {
      identifier: { type: 'm.id.user', user: UID },
      password: PASSWORD,
      initial_device_display_name: 'BeeperMCP Test',
    });

    console.log('Login successful!');
    console.log('User ID:', res.user_id);
    console.log('Device ID:', res.device_id);
    console.log('Access Token:', res.access_token);

    // Save the token to the session file
    const sessionData = {
      deviceId: res.device_id,
      token: res.access_token,
    };

    const sessionFile = path.join('./mx-cache', 'session.json');
    ensureDir(path.dirname(sessionFile));
    fs.writeFileSync(sessionFile, JSON.stringify(sessionData, null, 2));
    console.log('Session saved to:', sessionFile);

    return res.access_token;
  } catch (e) {
    console.error('Login failed:', e);
    throw e;
  }
}

testLogin().catch(console.error);
