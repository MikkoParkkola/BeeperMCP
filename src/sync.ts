import fs from 'fs';
import path from 'path';
import type Pino from 'pino';
import type { MatrixClient } from 'matrix-js-sdk';
import type { FileSessionStore } from '../utils.js';

export async function startSync(
  client: MatrixClient,
  sessionStore: FileSessionStore,
  syncKey: string,
  logger: Pino.Logger,
  options: {
    concurrency: number;
    testRoomId?: string | null;
    cacheDir: string;
  },
) {
  const { concurrency, testRoomId, cacheDir } = options;
  const lastToken = sessionStore.getItem(syncKey);
  if (lastToken && (client.store as any)?.setSyncToken) {
    client.store.setSyncToken(lastToken);
  }
  logger.info('Starting Matrix sync');
  await client.startClient({ initialSyncLimit: 10 });
  await new Promise<void>((r) =>
    client.once('sync' as any, (s: any) => s === 'PREPARED' && r()),
  );
  client.on(
    'sync' as any,
    (_s: any, _p: any, data: any) =>
      data.nextBatch && sessionStore.setItem(syncKey, data.nextBatch),
  );
  logger.info('Matrix sync ready');
  // SECURITY: Do not auto-verify devices. This was previously used to
  // force decryption to succeed, but it weakens trust and can lead to
  // inadvertent key sharing. We keep a lightweight key download to warm
  // caches, but leave verification to explicit user workflows.
  try {
    const users = new Set<string>();
    client
      .getRooms()
      .forEach((r) => r.getJoinedMembers().forEach((m) => users.add(m.userId)));
    const usersToProcess = [...users];
    if (usersToProcess.length > 0) {
      logger.info(
        `Downloading device keys for ${usersToProcess.length} users...`,
      );
      if (typeof (client as any).downloadKeys === 'function') {
        await (client as any).downloadKeys(usersToProcess, true);
      }
      logger.info('Device keys downloaded; skipping automatic verification.');
    } else {
      logger.info(
        'No users found in joined rooms to download device keys for.',
      );
    }
  } catch (e: any) {
    logger.warn('Key prefetch failed:', e.message);
  }

  const limiter = ((n: number) => {
    let active = 0;
    const queue: Array<() => Promise<void>> = [];
    const next = () => {
      if (active < n && queue.length) {
        active++;
        queue.shift()!();
      }
    };
    return async (fn: () => Promise<void>) =>
      new Promise<void>((resolve) => {
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
          await client.emit('event' as any, ev);
        }
      }),
    ),
  );
  logger.info('Backfill complete');
  try {
    const cryptoApi = client.getCrypto();
    if (cryptoApi && cryptoApi.exportRoomKeys) {
      const exported = await cryptoApi.exportRoomKeys();
      const keyCacheFile = path.join(cacheDir, 'room-keys.json');
      fs.writeFileSync(keyCacheFile, JSON.stringify(exported));
      logger.info(`Exported ${exported.length} room keys to ${keyCacheFile}`);
    }
  } catch (e: any) {
    logger.warn('Failed to export room keys:', e.message);
  }
}
