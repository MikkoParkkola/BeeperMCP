'use strict';
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.createMatrixClient = createMatrixClient;
const matrix_js_sdk_1 = __importDefault(require('matrix-js-sdk'));
const path_1 = __importDefault(require('path'));
const utils_js_1 = require('../utils.js');
const auth_js_1 = require('./auth.js');
const crypto_js_1 = require('./crypto.js');
async function createMatrixClient(config, logger) {
  const {
    baseUrl,
    userId,
    accessToken,
    cacheDir,
    msc4190,
    msc3202,
    sessionSecret,
    keyBackupRecoveryKey,
  } = config;
  await (0, crypto_js_1.loadOlm)(logger);
  const initRust = await (0, crypto_js_1.loadRustCryptoAdapter)(logger);
  const sessionStore = new utils_js_1.FileSessionStore(
    path_1.default.join(cacheDir, 'session.json'),
    sessionSecret,
  );
  const deviceKey = `deviceId:${userId}`;
  let deviceId = sessionStore.getItem(deviceKey);
  if (!deviceId) {
    deviceId = Math.random().toString(36).substring(2, 12);
    sessionStore.setItem(deviceKey, deviceId);
  }
  const cryptoStore = await (0, crypto_js_1.loadFileCryptoStore)(
    cacheDir,
    logger,
  );
  const sdkLogger = {
    debug: logger.debug.bind(logger),
    info: logger.info.bind(logger),
    warn: (msg, ...args) => {
      try {
        if (typeof msg === 'string' && msg.startsWith('Error decrypting event'))
          return;
      } catch (err) {
        logger.warn('Failed to inspect SDK warning message', err);
      }
      logger.warn(msg, ...args);
    },
    log: (msg, ...args) => {
      try {
        if (typeof msg === 'string' && msg.startsWith('Error decrypting event'))
          return;
      } catch (err) {
        logger.warn('Failed to inspect SDK log message', err);
      }
      logger.info(msg, ...args);
    },
    error: logger.error.bind(logger),
  };
  const client = matrix_js_sdk_1.default.createClient({
    logger: sdkLogger,
    baseUrl,
    accessToken,
    userId,
    deviceId,
    sessionStore,
    cryptoStore,
    timelineSupport: true,
    encryption: { msc4190, msc3202 },
  });
  await (0, auth_js_1.verifyAccessToken)(baseUrl, accessToken, userId, logger);
  if (typeof client.initCrypto === 'function') {
    await client.initCrypto();
  }
  logger.info('matrix-js-sdk crypto initialized');
  const cryptoApiGlobal = client.getCrypto();
  if (cryptoApiGlobal) {
    if (typeof cryptoApiGlobal.setGlobalErrorOnUnknownDevices === 'function') {
      cryptoApiGlobal.setGlobalErrorOnUnknownDevices(false);
    }
    if (
      typeof cryptoApiGlobal.setGlobalBlacklistUnverifiedDevices === 'function'
    ) {
      cryptoApiGlobal.setGlobalBlacklistUnverifiedDevices(false);
    }
  }
  if (initRust) {
    await initRust(client);
    logger.debug('rust-crypto adapter initialized');
  }
  await (0, crypto_js_1.restoreRoomKeys)(
    client,
    cacheDir,
    logger,
    keyBackupRecoveryKey,
  );
  return { client, sessionStore };
}
// Recommended additional files to add to the chat/repo if you want me to continue
// wiring functionality and tests:
// - Postgres: messages schema (CREATE TABLE messages ...)
// - scripts/migrate.ts
// - src/ingest/matrix.ts        // full /sync ingest to populate messages table
// - src/index/reembed.ts        // re-embedding worker (expand if necessary)
// - src/mcp/tools/sentimentTrends.ts
// - src/mcp/tools/sentimentDistribution.ts
// - src/mcp/tools/messageContext.ts
// - src/mcp/tools/mediaProxy.ts
// - src/decryption-manager.js
// - src/event-logger.ts         // already provided but may need tweaks for E2EE
// - mcp-tools.d.ts              // already provided
//
// Additional recommended files to add now (high priority to enable a full build/run):
// - utils.js
// - mcp-tools.js
// - src/mcp/resources.ts
// - src/mcp/server.ts
// - scripts/migrate.ts
// - migrations/*.sql
