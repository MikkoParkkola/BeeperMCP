import dotenv from 'dotenv';
dotenv.config({ path: '.beeper-mcp-server.env' });
import sdk from 'matrix-js-sdk';
import fs from 'fs';
import path from 'path';

const HS = process.env.MATRIX_HOMESERVER ?? 'https://matrix.beeper.com';
const UID = process.env.MATRIX_USERID;
const TOKEN = process.env.MATRIX_TOKEN;

async function testConnection() {
  console.log('Testing connection with access token...');

  if (!UID) throw new Error('MATRIX_USERID is required');
  if (!TOKEN) throw new Error('MATRIX_TOKEN is required');

  const client = sdk.createClient({
    baseUrl: HS,
    userId: UID,
    accessToken: TOKEN,
    useAuthorizationHeader: true,
  });

  try {
    console.log('Attempting to verify token...');
    const res = await client.whoami();
    console.log('Token verified successfully!');
    console.log('User ID:', res.user_id);

    // Test getting account data
    console.log('Fetching account data...');
    const accountData = await client.getAccountDataFromServer();
    console.log('Account data fetched successfully!');

    console.log('Connection test completed successfully!');
    return true;
  } catch (e) {
    console.error('Connection test failed:', e);
    throw e;
  }
}

testConnection()
  .then(() => {
    console.log('All tests passed!');
  })
  .catch((error) => {
    console.error('Test failed with error:', error);
  });
