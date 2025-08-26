'use strict';
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.startSync = startSync;
const fs_1 = __importDefault(require('fs'));
const path_1 = __importDefault(require('path'));
async function startSync(client, sessionStore, syncKey, logger, options) {
  const { concurrency, testRoomId, cacheDir } = options;
  const lastToken = sessionStore.getItem(syncKey);
  if (lastToken && client.store?.setSyncToken) {
    client.store.setSyncToken(lastToken);
  }
  logger.info('Starting Matrix sync');
  await client.startClient({ initialSyncLimit: 10 });
  await new Promise((r) => client.once('sync', (s) => s === 'PREPARED' && r()));
  client.on(
    'sync',
    (_s, _p, data) =>
      data.nextBatch && sessionStore.setItem(syncKey, data.nextBatch),
  );
  logger.info('Matrix sync ready');
  // SECURITY: Do not auto-verify devices. This was previously used to
  // force decryption to succeed, but it weakens trust and can lead to
  // inadvertent key sharing. We keep a lightweight key download to warm
  // caches, but leave verification to explicit user workflows.
  try {
    const users = new Set();
    client
      .getRooms()
      .forEach((r) => r.getJoinedMembers().forEach((m) => users.add(m.userId)));
    const usersToProcess = [...users];
    if (usersToProcess.length > 0) {
      logger.info(
        `Downloading device keys for ${usersToProcess.length} users...`,
      );
      if (typeof client.downloadKeys === 'function') {
        await client.downloadKeys(usersToProcess, true);
      }
      logger.info('Device keys downloaded; skipping automatic verification.');
    } else {
      logger.info(
        'No users found in joined rooms to download device keys for.',
      );
    }
  } catch (e) {
    logger.warn('Key prefetch failed:', e.message);
  }
  const limiter = ((n) => {
    let active = 0;
    const queue = [];
    const next = () => {
      if (active < n && queue.length) {
        active++;
        queue.shift()();
      }
    };
    return async (fn) =>
      new Promise((resolve) => {
        queue.push(async () => {
          try {
            await fn();
          } finally {
            active--;
            next();
            resolve();
          }
        });
        next();
      });
  })(concurrency);
  const roomsToBackfill = testRoomId
    ? client.getRooms().filter((r) => r.roomId === testRoomId)
    : client.getRooms();
  await Promise.all(
    roomsToBackfill.map((r) =>
      limiter(async () => {
        const tl = r.getLiveTimeline();
        while (
          await client.paginateEventTimeline(tl, {
            backwards: true,
            limit: 1000,
          })
        );
        for (const ev of tl.getEvents().sort((a, b) => a.getTs() - b.getTs())) {
          await client.emit('event', ev);
        }
      }),
    ),
  );
  logger.info('Backfill complete');
  try {
    const cryptoApi = client.getCrypto();
    if (cryptoApi && cryptoApi.exportRoomKeys) {
      const exported = await cryptoApi.exportRoomKeys();
      const keyCacheFile = path_1.default.join(cacheDir, 'room-keys.json');
      fs_1.default.writeFileSync(keyCacheFile, JSON.stringify(exported));
      logger.info(`Exported ${exported.length} room keys to ${keyCacheFile}`);
    }
  } catch (e) {
    logger.warn('Failed to export room keys:', e.message);
  }
}
