#!/usr/bin/env node
'use strict';
var __createBinding =
  (this && this.__createBinding) ||
  (Object.create
    ? function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (
          !desc ||
          ('get' in desc ? !m.__esModule : desc.writable || desc.configurable)
        ) {
          desc = {
            enumerable: true,
            get: function () {
              return m[k];
            },
          };
        }
        Object.defineProperty(o, k2, desc);
      }
    : function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
      });
var __setModuleDefault =
  (this && this.__setModuleDefault) ||
  (Object.create
    ? function (o, v) {
        Object.defineProperty(o, 'default', { enumerable: true, value: v });
      }
    : function (o, v) {
        o['default'] = v;
      });
var __importStar =
  (this && this.__importStar) ||
  (function () {
    var ownKeys = function (o) {
      ownKeys =
        Object.getOwnPropertyNames ||
        function (o) {
          var ar = [];
          for (var k in o)
            if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
          return ar;
        };
      return ownKeys(o);
    };
    return function (mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null)
        for (var k = ownKeys(mod), i = 0; i < k.length; i++)
          if (k[i] !== 'default') __createBinding(result, mod, k[i]);
      __setModuleDefault(result, mod);
      return result;
    };
  })();
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.initClientCrypto = initClientCrypto;
/// <reference path="./matrix-js-sdk-shim.d.ts" />
/*
  Helper note: phased-setup.ts references several runtime modules and
  project files. If you haven't added them yet, consider adding:

  - src/config.ts
  - utils.js
  - mcp-tools.js
  - src/decryption-manager.js
  - src/crypto.js
  - src/auth.js
  - src/mcp/resources.ts
  - src/index/search.ts
  - src/index/reembed.ts
  - src/mcp/tools/*.ts (recap, responseTime, sentimentTrends, sentimentDistribution, whoSaid, activity, draftReply, sendMessage)

  These are not strictly required for the setup script itself but are
  referenced elsewhere in the project and useful to include now to
  allow subsequent SEARCH/REPLACE edits to be applied cleanly.
*/
const dotenv_1 = __importDefault(require('dotenv'));
dotenv_1.default.config({ path: '.beeper-mcp-server.env' });
const matrix_js_sdk_1 = __importDefault(require('matrix-js-sdk'));
const fs_1 = __importDefault(require('fs'));
const path_1 = __importDefault(require('path'));
const pino_1 = __importDefault(require('pino'));
const utils_js_1 = require('./utils.js');
const HS = process.env.MATRIX_HOMESERVER ?? 'https://matrix.beeper.com';
const UID = process.env.MATRIX_USERID;
let TOKEN = process.env.MATRIX_TOKEN;
const PASSWORD = process.env.MATRIX_PASSWORD;
const CACHE_DIR = process.env.MATRIX_CACHE_DIR ?? './mx-cache';
const LOG_DIR = process.env.MESSAGE_LOG_DIR ?? './room-logs';
const LOG_LEVEL = process.env.LOG_LEVEL ?? 'info';
async function phaseLogin(logger) {
  logger.info('Phase 1: login');
  if (!UID) throw new Error('MATRIX_USERID is required');
  (0, utils_js_1.ensureDir)(CACHE_DIR);
  const session = new utils_js_1.FileSessionStore(
    path_1.default.join(CACHE_DIR, 'session.json'),
  );
  let deviceId = session.getItem('deviceId');
  if (!deviceId) {
    deviceId = Math.random().toString(36).substring(2, 12);
    session.setItem('deviceId', deviceId);
  }
  const client = matrix_js_sdk_1.default.createClient({
    baseUrl: HS,
    userId: UID,
    deviceId,
  });
  if (TOKEN) {
    logger.info('Using MATRIX_TOKEN from environment');
    client.setAccessToken(TOKEN);
    return { client, token: TOKEN };
  }
  if (!PASSWORD) throw new Error('MATRIX_PASSWORD must be set for login');
  try {
    const res = await client.login('m.login.password', {
      identifier: { type: 'm.id.user', user: UID },
      password: PASSWORD,
      initial_device_display_name: 'BeeperMCP',
    });
    TOKEN = res.access_token;
    session.setItem('token', TOKEN);
    session.setItem('deviceId', res.device_id);
    logger.info(`Logged in as ${UID}, device ${res.device_id}`);
    client.setAccessToken(TOKEN);
    process.env.MATRIX_TOKEN = TOKEN;
    return { client, token: TOKEN };
  } catch (e) {
    logger.error(`Login failed: ${e.message}`);
    throw e;
  }
}
async function phaseLoadCache(logger) {
  logger.info('Phase 2: load local cache');
  (0, utils_js_1.ensureDir)(CACHE_DIR);
  (0, utils_js_1.ensureDir)(LOG_DIR);
  if (process.env.DELETE_PLAINTEXT_LOGS === 'true') {
    const files = fs_1.default.readdirSync(LOG_DIR);
    for (const f of files) {
      if (f.endsWith('.log'))
        fs_1.default.rmSync(path_1.default.join(LOG_DIR, f), { force: true });
    }
    logger.info('Plain-text logs removed');
  }
}
async function restoreRoomKeys(client, logger) {
  const recoveryKey = process.env.KEY_BACKUP_RECOVERY_KEY;
  if (client.restoreKeyBackupWithCache && client.getKeyBackupVersion) {
    try {
      const backupInfo = await client.getKeyBackupVersion();
      if (!backupInfo) {
        logger.info('No key backup configured on server.');
      } else if (recoveryKey) {
        const restored = await client.restoreKeyBackupWithCache(
          undefined,
          recoveryKey,
          backupInfo,
        );
        logger.info(`Restored ${restored.length} room keys via secure backup`);
      } else {
        logger.warn(
          'Key backup exists, but KEY_BACKUP_RECOVERY_KEY not provided.',
        );
      }
    } catch (e) {
      logger.error('Failed to restore from secure backup:', e.message);
    }
  }
  try {
    const keyFile = path_1.default.join(CACHE_DIR, 'room-keys.json');
    if (fs_1.default.existsSync(keyFile)) {
      const exported = JSON.parse(fs_1.default.readFileSync(keyFile, 'utf8'));
      const cryptoApi = client.getCrypto();
      if (cryptoApi) {
        await cryptoApi.importRoomKeys(exported, {});
        if (exported && typeof exported.length === 'number') {
          logger.info(
            `Attempted import from room-keys.json: Found ${exported.length} sessions in the file.`,
          );
        }
      }
    }
  } catch (e) {
    logger.warn('Failed to import room keys:', e.message);
  }
}
async function initClientCrypto(client, logger) {
  const cryptoApi = client.getCrypto?.();
  if (typeof client.initCrypto === 'function') {
    await client.initCrypto();
  } else if (cryptoApi && typeof cryptoApi.init === 'function') {
    await cryptoApi.init();
  } else {
    logger.warn(
      'Crypto initialization skipped: no initCrypto() or getCrypto().init()',
    );
  }
}
async function phaseGetKeys(client, logger) {
  logger.info('Phase 3: load encryption keys');
  try {
    const olmMod = await Promise.resolve().then(() =>
      __importStar(require('@matrix-org/olm')),
    );
    const Olm = olmMod.default || olmMod;
    await Olm.init();
    globalThis.Olm = Olm;
    logger.info('Olm library initialized');
  } catch (e) {
    logger.error(`Olm init failed: ${e.message}`);
    throw e;
  }
  await initClientCrypto(client, logger);
  await restoreRoomKeys(client, logger);
}
async function phaseDecrypt(client, logger) {
  logger.info('Phase 4: start sync');
  await client.startClient({ initialSyncLimit: 10 });
  await new Promise((resolve) => {
    client.once('sync', (s) => s === 'PREPARED' && resolve());
  });
  logger.info('Client synced, ready for decryption');
  // stop the Matrix client so the setup script can exit cleanly
  await client.stopClient();
  logger.info('Client stopped');
}
(async () => {
  const logger = (0, pino_1.default)({ level: LOG_LEVEL });
  let res;
  try {
    res = await phaseLogin(logger);
  } catch (e) {
    logger.error(`Phase 1 failed: ${e.message}`);
    process.exit(1);
  }
  try {
    await phaseLoadCache(logger);
  } catch (e) {
    logger.error(`Phase 2 failed: ${e.message}`);
    process.exit(1);
  }
  try {
    await phaseGetKeys(res.client, logger);
  } catch (e) {
    logger.error(`Phase 3 failed: ${e.message}`);
    process.exit(1);
  }
  try {
    await phaseDecrypt(res.client, logger);
  } catch (e) {
    logger.error(`Phase 4 failed: ${e.message}`);
    process.exit(1);
  }
})();
