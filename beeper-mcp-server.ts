#!/usr/bin/env node

/**
 * beeper-mcp-server.ts v2.2.0
 *
 * • Local cache for syncToken
 * • E2EE decryption via Olm (required) with optional rust-crypto
 * • Saves chat logs and media per-room
 * • MCP tools: list_rooms, create_room, list_messages, send_message
 * • Graceful shutdown
 */

/// <reference path="./matrix-js-sdk-shim.d.ts" />

import dotenv from 'dotenv';
dotenv.config({ path: '.beeper-mcp-server.env' });
import sdk, { MatrixClient, MatrixEvent } from 'matrix-js-sdk';
import Pino from 'pino';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ensureDir,
  safeFilename,
  getRoomDir,
  pipelineAsync,
  FileSessionStore,
  appendWithRotate,
  openLogDb,
  insertLog,
  queryLogs,
  pushWithLimit,
  BoundedMap,
} from './utils.js';

// --- Constants ---
const CACHE_DIR = process.env.MATRIX_CACHE_DIR ?? './mx-cache';
const LOG_DIR   = process.env.MESSAGE_LOG_DIR  ?? './room-logs';
const LOG_MAX_BYTES = Number(process.env.LOG_MAX_BYTES ?? '5000000');
const LOG_SECRET = process.env.LOG_SECRET;
const LOG_LEVEL = process.env.LOG_LEVEL ?? 'info';
const HS        = process.env.MATRIX_HOMESERVER ?? 'https://matrix.beeper.com';
const UID       = process.env.MATRIX_USERID;
let TOKEN: string | undefined = process.env.MATRIX_TOKEN;
if (!TOKEN) {
  try {
    const sessionPath = path.join(CACHE_DIR, 'session.json');
    if (fs.existsSync(sessionPath)) {
      const data = JSON.parse(fs.readFileSync(sessionPath, 'utf8')) as Record<string, string>;
      TOKEN = data.token;
    }
  } catch {}
}
const CONC      = Number(process.env.BACKFILL_CONCURRENCY ?? '5');
const INITIAL_REQUEST_INTERVAL_MS = Number(process.env.KEY_REQUEST_INTERVAL_MS ?? '1000');
const MAX_REQUEST_INTERVAL_MS = Number(process.env.KEY_REQUEST_MAX_INTERVAL_MS ?? '300000');
// enable MSC4190 key-forwarding by default; set MSC4190=false to disable
const MSC4190 = process.env.MSC4190 !== 'false';
// enable MSC3202 device masquerading by default; set MSC3202=false to disable
const MSC3202 = process.env.MSC3202 !== 'false';
if (!UID || !TOKEN) {
  console.error('Error: MATRIX_USERID and MATRIX_TOKEN must be set');
  process.exit(1);
}

// --- Credential helpers ---
async function verifyAccessToken(logger: Pino.Logger): Promise<void> {
  try {
    const res = await fetch(`${HS}/_matrix/client/v3/account/whoami`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { user_id?: string };
    if (!data.user_id) throw new Error('No user_id in response');
    if (UID && data.user_id !== UID) {
      throw new Error(`Token user_id ${data.user_id} does not match ${UID}`);
    }
    logger.info(`Access token validated for ${data.user_id}`);
  } catch (err: any) {
    logger.error(`Failed to validate access token: ${err.message}`);
    process.exit(1);
  }
}

async function restoreRoomKeys(client: MatrixClient, logger: Pino.Logger) {
  const recoveryKey = process.env.KEY_BACKUP_RECOVERY_KEY;
  if (
    typeof (client as any).restoreKeyBackupWithCache === 'function' &&
    typeof (client as any).getKeyBackupVersion === 'function'
  ) {
    try {
      const backupInfo = await (client as any).getKeyBackupVersion();
      logger.info(
        {
          backupVersion: backupInfo?.version,
          backupAlgorithm: backupInfo?.algorithm,
          recoveryKeyType: backupInfo?.recovery_key?.type,
        },
        'Received key backup info from server.'
      );
      if (!backupInfo) {
        logger.info('No key backup configured on server.');
      } else if (recoveryKey) {
        const restored = await (client as any).restoreKeyBackupWithCache(
          undefined,
          recoveryKey,
          backupInfo as any
        );
        logger.info(`Restored ${restored.length} room keys via secure backup`);
      } else {
        logger.warn(
          'Key backup exists on server, but no KEY_BACKUP_RECOVERY_KEY provided.'
        );
      }
    } catch (e: any) {
      logger.error('Failed to restore from secure backup:', e.message);
    }
  }
  // import previously exported room keys, if any
  try {
    const keyFile = path.join(CACHE_DIR, 'room-keys.json');
    if (fs.existsSync(keyFile)) {
      const exported = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
      const cryptoApi = client.getCrypto();
      if (cryptoApi) {
        await cryptoApi.importRoomKeys(exported as any, {});
        if (exported && typeof (exported as any).length === 'number') {
          logger.info(
            `Attempted import from room-keys.json: Found ${exported.length} sessions in the file.`
          );
        } else {
          logger.warn(
            'Attempted import from room-keys.json: File existed but content was not as expected.'
          );
        }
      }
    }
  } catch (e: any) {
    logger.warn('Failed to import room keys:', e.message);
  }
}

// --- Session Store for sync tokens ---
(async () => {
  ensureDir(CACHE_DIR);
  ensureDir(LOG_DIR);
  const LOG_DB_PATH = process.env.LOG_DB_PATH ?? path.join(LOG_DIR, 'messages.db');
  const logDb = openLogDb(LOG_DB_PATH);
  // main Pino logger
  const logger = Pino({ level: LOG_LEVEL });
  // wrap for matrix-js-sdk: suppress expected decryption errors
  const sdkLogger = {
    debug: logger.debug.bind(logger),
    info:  logger.info.bind(logger),
    warn:  (msg: any, ...args: any[]) => {
      try {
        if (typeof msg === 'string' && msg.startsWith('Error decrypting event')) return;
      } catch { /* ignore */ }
      logger.warn(msg as any, ...args);
    },
    log:   (msg: any, ...args: any[]) => {
      try {
        if (typeof msg === 'string' && msg.startsWith('Error decrypting event')) return;
      } catch { /* ignore */ }
      // map sdk.log to info
      logger.info(msg as any, ...args);
    },
    error: logger.error.bind(logger),
  };
  // test mode: limit to one room and number of events
  const TEST_ROOM_ID = process.env.TEST_ROOM_ID;
  const TEST_LIMIT = process.env.TEST_LIMIT ? parseInt(process.env.TEST_LIMIT, 10) : 0;
  let testCount = 0;

  // load Olm for decryption
  try {
    const olmMod = await import('@matrix-org/olm');
    const Olm = (olmMod as any).default || olmMod;
    await Olm.init();
    (globalThis as any).Olm = Olm;
    logger.info('Olm library initialized');
  } catch (e: any) {
    console.error('Error: @matrix-org/olm not installed or failed to init:', e.message);
    process.exit(1);
  }

  // optional rust-crypto adapter
  let initRust: ((client: MatrixClient) => Promise<void>) | null = null;
  try {
    const mod = await import('@matrix-org/matrix-sdk-crypto-nodejs');
    initRust = (mod as any).initRustCrypto;
    logger.debug('rust-crypto adapter loaded');
  } catch {
    logger.debug('rust-crypto adapter not available');
  }

  // session storage & device
  const sessionStore = new FileSessionStore(
    path.join(CACHE_DIR, 'session.json'),
    process.env.SESSION_SECRET
  );
  const syncKey = `syncToken:${UID}`;
  const deviceKey = `deviceId:${UID}`;
  let deviceId = sessionStore.getItem(deviceKey) as string | null;
  if (!deviceId) {
    deviceId = Math.random().toString(36).substring(2, 12);
    sessionStore.setItem(deviceKey, deviceId);
  }

  // load file-backed crypto store (Node) if available
  let FileCryptoStoreClass: any = null;
  try {
    const mod = await import('matrix-js-sdk/dist/cjs/crypto/node/crypto-store.js');
    FileCryptoStoreClass = mod.FileCryptoStore;
    logger.debug('FileCryptoStore loaded');
  } catch {
    logger.debug('FileCryptoStore unavailable, using in-memory');
  }

  // Matrix client setup
  const cryptoStore = FileCryptoStoreClass
    ? new FileCryptoStoreClass(path.join(CACHE_DIR, 'crypto-store'))
    : undefined;
  const client = sdk.createClient({
    logger: sdkLogger,
    baseUrl: HS,
    accessToken: TOKEN,
    userId: UID,
    deviceId,
    sessionStore,
    cryptoStore,
    timelineSupport: true,
    encryption: { msc4190: MSC4190, msc3202: MSC3202 },
  } as any);

  await verifyAccessToken(logger);

  const PENDING_DECRYPT_MAX_SESSIONS = Number(
    process.env.PENDING_DECRYPT_MAX_SESSIONS ?? '1000'
  );
  const PENDING_DECRYPT_MAX_PER_SESSION = Number(
    process.env.PENDING_DECRYPT_MAX_PER_SESSION ?? '100'
  );
  const REQUESTED_KEYS_MAX = Number(
    process.env.REQUESTED_KEYS_MAX ?? '1000'
  );
  // pending events waiting for room keys: map of "roomId|session_id" to encrypted events
  const pendingDecrypt = new BoundedMap<string, MatrixEvent[]>(
    PENDING_DECRYPT_MAX_SESSIONS
  );
  // track when a key request was last sent for a given session
  // and the current backoff interval for retries
  const requestedKeys = new BoundedMap<
    string,
    { last: number; interval: number; logged: boolean }
  >(REQUESTED_KEYS_MAX);
  // capture to-device events for room-keys and replay pending decrypts
  client.on('toDeviceEvent' as any, async (ev: MatrixEvent) => {
    try {
      const evtType = ev.getType();
      logger.trace(`toDeviceEvent ${evtType} from ${ev.getSender()}`);
      const cryptoApi = client.getCrypto();
      if (cryptoApi) {
        await (cryptoApi as any).decryptEvent(ev as any);
      }
      // replay queued timeline events if a room key arrived
      if (evtType === 'm.room_key' || evtType === 'm.forwarded_room_key') {
        const content = ev.getClearContent?.() || ev.getContent();
        const room_id = (content as any).room_id;
        const session_id = (content as any).session_id;
        if (room_id && session_id) {
          const key = `${room_id}|${session_id}`;
          const arr = pendingDecrypt.get(key);
          if (arr) {
            for (const pending of arr) {
              await decryptEvent(pending);
              // emit decrypted event for logging
              client.emit('event' as any, pending);
            }
            pendingDecrypt.delete(key);
          }
          requestedKeys.delete(key);
        }
      }
    } catch {}
  });

  // restore sync token
  const lastToken = sessionStore.getItem(syncKey);
  if (lastToken && client.store?.setSyncToken) client.store.setSyncToken(lastToken);

  // init crypto
  await client.initCrypto();
  logger.info('matrix-js-sdk crypto initialized');
  // allow decryption from unverified devices and unknown devices without error
  const cryptoApiGlobal = client.getCrypto();
  if (cryptoApiGlobal) {
    if (typeof (cryptoApiGlobal as any).setGlobalErrorOnUnknownDevices === 'function') {
      (cryptoApiGlobal as any).setGlobalErrorOnUnknownDevices(false);
    }
    if (typeof (cryptoApiGlobal as any).setGlobalBlacklistUnverifiedDevices === 'function') {
      (cryptoApiGlobal as any).setGlobalBlacklistUnverifiedDevices(false);
    }
  }
  if (initRust) { await initRust(client); logger.debug('rust-crypto adapter initialized'); }

  await restoreRoomKeys(client, logger);


  // decrypt helper: decrypt event or request missing room key and queue for retry
  const decryptEvent = async (ev: MatrixEvent) => {
    if (!ev.isEncrypted()) return;
    try {
      const cryptoApi = client.getCrypto();
      if (cryptoApi) {
        await (cryptoApi as any).decryptEvent(ev as any);
      }
    } catch (e: any) {
      const wire = ev.getWireContent?.() as any || (ev.event as any).content || {};
      const roomId = ev.getRoomId();
      if (e.name === 'DecryptionError' && e.code === 'MEGOLM_UNKNOWN_INBOUND_SESSION_ID') {
          logger.debug(`Unknown session for event ${ev.getId()} in room ${roomId}: session ${wire.session_id}`);
      } else if (e.name === 'DecryptionError') {
          logger.error(`Decrypt: Serious decryption error for event ${ev.getId()} in room ${roomId} (Code: ${e.code || 'unknown'}): ${e.message}. Queuing for retry.`);
      } else {
          logger.error({err: e}, `Decrypt: Unexpected error for event ${ev.getId()} in room ${roomId}: ${e.message}. Queuing for retry.`);
      }
      // queue event for retry and request a room key
      try {
        const sessionId = wire.session_id;
        const algorithm = wire.algorithm;
        if (roomId && sessionId && algorithm) {
          const mapKey = `${roomId}|${sessionId}`;
          const arr = pendingDecrypt.get(mapKey) || [];
          pushWithLimit(arr, ev, PENDING_DECRYPT_MAX_PER_SESSION);
          pendingDecrypt.set(mapKey, arr);
          const sender = ev.getSender();
          if (sender === UID) {
            logger.info(
              `Decrypt: Missing keys for our own event ${ev.getId()} in room ${roomId}; not requesting from ourselves.`
            );
          } else {
            const entry = requestedKeys.get(mapKey) || { last: 0, interval: INITIAL_REQUEST_INTERVAL_MS, logged: false };
            const now = Date.now();
            if (now - entry.last >= entry.interval) {
              entry.last = now;
              entry.interval = Math.min(entry.interval * 2, MAX_REQUEST_INTERVAL_MS);
              requestedKeys.set(mapKey, entry);
              if (!entry.logged) {
                logger.warn(`Requesting missing room key for session ${mapKey}`);
                entry.logged = true;
              } else {
                logger.debug(`Retrying room key request for session ${mapKey}`);
              }
              const cryptoApi = client.getCrypto();
              if (cryptoApi) {
                await (cryptoApi as any).requestRoomKey(
                  { room_id: roomId, session_id: sessionId, algorithm },
                  [{ userId: sender!, deviceId: '*' }]
                );
              }
            } else {
              logger.trace(`room key for session ${mapKey} already requested recently`);
            }
          }
        }
      } catch (ex: any) {
        logger.warn(`requestRoomKey failed: ${ex.message}`);
      }
    }
  };

  // event logging
  const seen = new Set<string>();
  client.on('event' as any, async (ev: any) => {
    const evtType = ev.getType();
    // timeline key events: use these to retry pending decrypts
    if (evtType === 'm.room_key' || evtType === 'm.forwarded_room_key') {
      // timeline key event: retry pending decrypts
      const contentAny = ev.getContent() as any;
      const room_id = contentAny.room_id;
      const session_id = contentAny.session_id;
      if (room_id && session_id) {
        const mapKey = `${room_id}|${session_id}`;
      logger.trace(`timeline key event ${evtType} for session ${mapKey}`);
        const arr = pendingDecrypt.get(mapKey);
        if (arr) {
          for (const pend of arr) {
            await decryptEvent(pend);
            client.emit('event' as any, pend);
          }
          pendingDecrypt.delete(mapKey);
        }
      }
      return;
    }
    // try to decrypt encrypted messages
    await decryptEvent(ev);
    // skip still-encrypted or key events
    if (ev.isEncrypted()) return;
    const id = ev.getId(); if (seen.has(id)) return; seen.add(id);
    // filter test room if specified
    const rid = ev.getRoomId() || 'meta';
    if (TEST_ROOM_ID && rid !== TEST_ROOM_ID) return;
    const type = ev.getClearType?.() || ev.getType();
    const content = ev.getClearContent?.() || ev.getContent();
    const ts = new Date(ev.getTs()||Date.now()).toISOString();
    // reuse 'rid' from above for directory
    const dir = getRoomDir(LOG_DIR, rid);
    const logf = path.join(dir, `${safeFilename(rid)}.log`);
    let line: string;
    if (type === 'm.room.message') {
      if (content.url) {
        try {
          const url = client.mxcUrlToHttp(content.url);
          const res = await fetch(url as string);
          if (res.ok) {
            const ext = path.extname(content.filename||content.body||'');
            const fname = `${ts.replace(/[:.]/g,'')}_${safeFilename(id)}${ext}`;
            await pipelineAsync(res.body as any, fs.createWriteStream(path.join(dir, fname)));
            line = `[${ts}] <${ev.getSender()}> [media] ${fname}`;
          } else {
            line = `[${ts}] <${ev.getSender()}> [media download failed]`;
          }
        } catch {
          line = `[${ts}] <${ev.getSender()}> [media download failed]`;
        }
      } else {
        line = `[${ts}] <${ev.getSender()}> ${content.body||'[non-text]'}`;
      }
    } else {
      line = `[${ts}] <${ev.getSender()}> [${type}]`;
    }
    await appendWithRotate(logf, line, LOG_MAX_BYTES, LOG_SECRET);
    insertLog(logDb, rid, ts, line, LOG_SECRET);
    // test mode: stop after limit
    if (TEST_LIMIT > 0) {
      testCount++;
      if (testCount >= TEST_LIMIT) {
        logger.info(`Test limit of ${TEST_LIMIT} events reached, shutting down.`);
        await shutdown();
      }
    }
  });

  // sync
  logger.info('Starting Matrix sync');
  await client.startClient({ initialSyncLimit: 10 });
  await new Promise<void>(r => client.once('sync' as any, (s: any) => s === 'PREPARED' && r()));
  client.on('sync' as any, (_s: any, _p: any, data: any) => data.nextBatch && sessionStore.setItem(syncKey, data.nextBatch));
  logger.info('Matrix sync ready');
  // trust all devices: download and mark all devices verified now that we have sync'd rooms
  try {
    const users = new Set<string>();
    client.getRooms().forEach(r => r.getJoinedMembers().forEach(m => users.add(m.userId)));
    let verifiedCount = 0;
    let failedCount = 0;
    const usersToProcess = [...users]; // Avoid issues if 'users' set is modified elsewhere, though unlikely here
    if (usersToProcess.length > 0) {
      logger.info(`Downloading device keys for ${usersToProcess.length} users...`);
      await client.downloadKeys(usersToProcess, true);
      for (const u of usersToProcess) {
        const devs = await client.getStoredDevicesForUser(u);
        for (const d of Object.keys(devs)) {
          try {
            await client.setDeviceVerified(u, d, true);
            verifiedCount++;
          } catch (err: any) {
            logger.warn(`Could not verify device ${d} for user ${u}: ${err.message}`);
            failedCount++;
          }
        }
      }
      logger.info(`Device verification attempt complete. Verified: ${verifiedCount}, Failed: ${failedCount} devices.`);
    } else {
        logger.info('No users found in joined rooms to perform device verification on.');
    }
  } catch (e: any) {
    logger.warn('Key trust failed:', e.message);
  }

  // backfill (optional per-room test filter)
  const limiter = ((n: number) => {
    let a = 0,
      q: Array<() => Promise<void>> = [];
    const nxt = () => {
      if (a < n && q.length) {
        a++;
        q.shift()!();
      }
    };
    return async (fn: () => Promise<void>) =>
      new Promise<void>(r => {
        q.push(async () => {
          try {
            await fn();
          } finally {
            a--;
            nxt();
            r();
          }
        });
        nxt();
      });
  })(CONC);
  const roomsToBackfill = TEST_ROOM_ID
    ? client.getRooms().filter(r => r.roomId === TEST_ROOM_ID)
    : client.getRooms();
  await Promise.all(
    roomsToBackfill.map(r => limiter(async () => {
      const tl = r.getLiveTimeline();
      while (await client.paginateEventTimeline(tl, { backwards: true, limit: 1000 }));
      for (const ev of tl.getEvents().sort((a,b) => a.getTs() - b.getTs())) {
        await client.emit('event' as any, ev);
      }
    }))
  );
  logger.info('Backfill complete');
  // export and cache room keys so we don't need to re-import manually
  try {
    const cryptoApi = client.getCrypto();
    if (cryptoApi && cryptoApi.exportRoomKeys) {
      const exported = await cryptoApi.exportRoomKeys();
      const keyCacheFile = path.join(CACHE_DIR, 'room-keys.json');
      fs.writeFileSync(keyCacheFile, JSON.stringify(exported));
      logger.info(`Exported ${exported.length} room keys to ${keyCacheFile}`);
    }
  } catch (e: any) {
    logger.warn('Failed to export room keys:', e.message);
  }

  // MCP tools
  const srv = new McpServer({ name:'Beeper', version:'2.2.0', description:'Matrix↔MCP logger' });

  (srv as any).tool('list_rooms', z.object({ limit:z.number().int().positive().default(50) }), async({limit}: any)=>{
    const out=client.getRooms()
      .sort((a,b)=>(b.getLastActiveTimestamp()||0)-(a.getLastActiveTimestamp()||0))
      .slice(0,limit)
      .map(r=>({room_id:r.roomId,name:r.name}));
    return { content:[{ type:'json', json:out } ] };
  });

  (srv as any).tool('create_room', z.object({ name:z.string().min(1), encrypted:z.boolean().default(false) }), async({name,encrypted}: any)=>{
    const opts:any={ name,visibility:'private' };
    if(encrypted) opts.initial_state=[{ type:'m.room.encryption', state_key:'', content:{ algorithm:'m.megolm.v1.aes-sha2' } }];
    const{room_id}=await client.createRoom(opts);
    return{ content:[{ type:'json', json:{ room_id } }] };
  });

  (srv as any).tool(
    'list_messages',
    z.object({
      room_id: z.string(),
      limit: z.number().int().positive().optional(),
      since: z.string().datetime().optional(),
      until: z.string().datetime().optional(),
    }),
    async ({ room_id, limit, since, until }: any) => {
      let lines: string[] = [];
      try {
        lines = queryLogs(logDb, room_id, limit, since, until, LOG_SECRET);
      } catch {}
      return { content: [{ type: 'json', json: lines.filter(Boolean) }] };
    }
  );

  (srv as any).tool('send_message', z.object({ room_id:z.string(), message:z.string().min(1) }), async({room_id,message}: any)=>{
    await client.sendTextMessage(room_id,message);
    return{ content:[{ type:'text', text:'sent' }] };
  });

  await srv.connect(new StdioServerTransport());

  // graceful shutdown
  const shutdown=async()=>{ logger.info('Shutting down'); try{ await client.stopClient(); }catch{} process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
})();
