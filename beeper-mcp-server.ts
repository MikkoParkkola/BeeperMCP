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

import 'dotenv/config';
import sdk, { MatrixClient, MatrixEvent } from 'matrix-js-sdk';
import Pino from 'pino';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { pipeline } from 'stream';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// --- Constants ---
const CACHE_DIR = process.env.MATRIX_CACHE_DIR ?? './mx-cache';
const LOG_DIR   = process.env.MESSAGE_LOG_DIR  ?? './room-logs';
const LOG_LEVEL = process.env.LOG_LEVEL ?? 'info';
const HS        = process.env.MATRIX_HOMESERVER ?? 'https://matrix.beeper.com';
const UID       = process.env.MATRIX_USERID;
const TOKEN     = process.env.MATRIX_TOKEN;
const CONC      = Number(process.env.BACKFILL_CONCURRENCY ?? '5');
if (!UID || !TOKEN) {
  console.error('Error: MATRIX_USERID and MATRIX_TOKEN must be set');
  process.exit(1);
}

// --- Utilities ---
function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
const safeFilename = (s = '') => s.replace(/[^A-Za-z0-9._-]/g, '_');
const getRoomDir = (roomId: string) => {
  const d = path.join(LOG_DIR, safeFilename(roomId));
  ensureDir(d);
  return d;
};
const pipelineAsync = promisify(pipeline);

// --- Session Store for sync tokens ---
class FileSessionStore implements Storage {
  constructor(private file: string) { ensureDir(path.dirname(file)); }
  private read() {
    try { return JSON.parse(fs.readFileSync(this.file, 'utf8')); }
    catch { return {}; }
  }
  getItem(key: string) { return this.read()[key] ?? null; }
  setItem(key: string, val: string) {
    const d = this.read(); d[key] = val;
    fs.writeFileSync(this.file, JSON.stringify(d));
  }
  removeItem(key: string) {
    const d = this.read(); delete d[key];
    fs.writeFileSync(this.file, JSON.stringify(d));
  }
}

(async () => {
  ensureDir(CACHE_DIR);
  ensureDir(LOG_DIR);
  // main Pino logger
  const logger = Pino({ level: LOG_LEVEL });
  // wrap for matrix-js-sdk: suppress expected decryption errors
  const sdkLogger = {
    debug: logger.debug.bind(logger),
    info:  logger.info.bind(logger),
    warn:  (msg: any, ...args: any[]) => {
      try {
        if (typeof msg === 'string' && msg.startsWith('Error decrypting event')) return;
      } catch {};
      logger.warn(msg as any, ...args);
    },
    log:   (msg: any, ...args: any[]) => {
      try {
        if (typeof msg === 'string' && msg.startsWith('Error decrypting event')) return;
      } catch {};
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
  const sessionStore = new FileSessionStore(path.join(CACHE_DIR, 'session.json'));
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
  });

  // pending events waiting for room keys: map of "roomId|session_id" to encrypted events
  const pendingDecrypt = new Map<string, MatrixEvent[]>();
  // capture to-device events for room-keys and replay pending decrypts
  client.on('toDeviceEvent', async (ev: MatrixEvent) => {
    try {
      const evtType = ev.getType();
      logger.debug(`toDeviceEvent received: ${evtType} from ${ev.getSender()}`);
      const cryptoApi = client.getCrypto();
      if (cryptoApi) {
        await cryptoApi.decryptEvent(ev as any);
        logger.debug(`toDeviceEvent decrypted: ${evtType}`);
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
              client.emit('event', pending);
            }
            pendingDecrypt.delete(key);
          }
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
    if (typeof cryptoApiGlobal.setGlobalErrorOnUnknownDevices === 'function') {
      cryptoApiGlobal.setGlobalErrorOnUnknownDevices(false);
    }
    if (typeof cryptoApiGlobal.setGlobalBlacklistUnverifiedDevices === 'function') {
      cryptoApiGlobal.setGlobalBlacklistUnverifiedDevices(false);
    }
  }
  if (initRust) { await initRust(client); logger.debug('rust-crypto adapter initialized'); }
  
  // Fetch the recovery key from env
  const recoveryKey = process.env.KEY_BACKUP_RECOVERY_KEY;

  // Restore room keys from server-side backup using the recovery key
  if (typeof client.restoreKeyBackupWithCache === 'function' && typeof client.getKeyBackupVersion === 'function') {
    try {
      const backupInfo = await client.getKeyBackupVersion();
      if (!backupInfo) {
        logger.info('No key backup configured on server.');
      } else if (recoveryKey) {
        const restored = await client.restoreKeyBackupWithCache(
          undefined,
          recoveryKey,
          backupInfo as any,
        );
        logger.info(`Restored ${restored.length} room keys via secure backup`);
      } else {
        logger.warn('Key backup exists on server, but no KEY_BACKUP_RECOVERY_KEY provided.');
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
        logger.debug('Imported room keys from cache');
      }
    }
  } catch (e: any) {
    logger.warn('Failed to import room keys:', e.message);
  }


  // decrypt helper: decrypt event or request missing room key and queue for retry
  const decryptEvent = async (ev: MatrixEvent) => {
    if (!ev.isEncrypted()) return;
    try {
      const cryptoApi = client.getCrypto();
      if (cryptoApi) {
        await cryptoApi.decryptEvent(ev as any);
        logger.debug(`decryptEvent succeeded for ${ev.getId()}`);
      }
    } catch (e: any) {
      logger.debug(`decryptEvent failed (${e.message}) for ${ev.getId()}`);
      // queue event for retry and request a room key
      try {
        const wire = ev.getWireContent?.() as any || (ev.event as any).content || {};
        const roomId = ev.getRoomId();
        const sessionId = wire.session_id;
        const algorithm = wire.algorithm;
        if (roomId && sessionId && algorithm) {
          const mapKey = `${roomId}|${sessionId}`;
          const arr = pendingDecrypt.get(mapKey) || [];
          arr.push(ev);
          pendingDecrypt.set(mapKey, arr);
          logger.debug(`requesting room key for session ${mapKey}`);
          const cryptoApi = client.getCrypto();
          if (cryptoApi) {
            await cryptoApi.requestRoomKey(
              { room_id: roomId, session_id: sessionId, algorithm },
              [{ userId: ev.getSender()!, deviceId: '*' }]
            );
          }
        }
      } catch (ex: any) {
        logger.warn(`requestRoomKey failed: ${ex.message}`);
      }
    }
  };

  // event logging
  const seen = new Set<string>();
  client.on('event', async ev => {
    const evtType = ev.getType();
    // timeline key events: use these to retry pending decrypts
    if (evtType === 'm.room_key' || evtType === 'm.forwarded_room_key') {
      // timeline key event: retry pending decrypts
      const contentAny = ev.getContent() as any;
      const room_id = contentAny.room_id;
      const session_id = contentAny.session_id;
      if (room_id && session_id) {
        const mapKey = `${room_id}|${session_id}`;
      logger.debug(`timeline key event ${evtType} for session ${mapKey}`);
        const arr = pendingDecrypt.get(mapKey);
        if (arr) {
          for (const pend of arr) {
            await decryptEvent(pend);
            client.emit('event', pend);
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
    const dir = getRoomDir(rid);
    const logf = path.join(dir, `${safeFilename(rid)}.log`);

    if (type === 'm.room.message') {
      if (content.url) {
        try {
          const url = client.mxcUrlToHttp(content.url);
          const res = await fetch(url);
          if (res.ok) {
            const ext = path.extname(content.filename||content.body||'');
            const fname = `${ts.replace(/[:.]/g,'')}_${safeFilename(id)}${ext}`;
            await pipelineAsync(res.body as any, fs.createWriteStream(path.join(dir, fname)));
            fs.appendFileSync(logf, `[${ts}] <${ev.getSender()}> [media] ${fname}\n`);
            return;
          }
        } catch {}
        fs.appendFileSync(logf, `[${ts}] <${ev.getSender()}> [media download failed]\n`);
      } else {
        fs.appendFileSync(logf, `[${ts}] <${ev.getSender()}> ${content.body||'[non-text]'}\n`);
      }
    } else {
      fs.appendFileSync(logf, `[${ts}] <${ev.getSender()}> [${type}]\n`);
    }
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
  await new Promise(r => client.once('sync', s => s==='PREPARED' && r()));
  client.on('sync', (_s,_p,data) => data.nextBatch && sessionStore.setItem(syncKey,data.nextBatch));
  logger.info('Matrix sync ready');
  // trust all devices: download and mark all devices verified now that we have sync'd rooms
  try {
    const users = new Set<string>();
    client.getRooms().forEach(r => r.getJoinedMembers().forEach(m => users.add(m.userId)));
    if (users.size) {
      logger.info(`Downloading device keys for ${users.size} users...`);
      await client.downloadKeys([...users], true);
      for (const u of users) {
        const devs = await client.getStoredDevicesForUser(u);
        for (const d of Object.keys(devs)) {
          try {
            // Must await to catch async errors on unknown devices
            await client.setDeviceVerified(u, d, true);
          } catch (err: any) {
            logger.warn(`Could not verify device ${d} for ${u}: ${err.message}`);
          }
        }
      }
      logger.info('All devices verified');
    }
  } catch (e: any) {
    logger.warn('Key trust failed:', e.message);
  }

  // backfill (optional per-room test filter)
  const limiter = ((n:number)=>{let a=0,q:Function[]=[];const nxt=()=>{if(a<n&&q.length){a++;q.shift()!();}};return async(fn:()=>Promise<void>)=>new Promise(r=>{q.push(async()=>{try{await fn();}finally{a--;nxt();r();}});nxt();});})(CONC);
  const roomsToBackfill = TEST_ROOM_ID
    ? client.getRooms().filter(r => r.roomId === TEST_ROOM_ID)
    : client.getRooms();
  await Promise.all(
    roomsToBackfill.map(r => limiter(async () => {
      const tl = r.getLiveTimeline();
      while (await client.paginateEventTimeline(tl, { backwards: true, limit: 1000 }));
      for (const ev of tl.getEvents().sort((a,b) => a.getTs() - b.getTs())) {
        await client.emit('event', ev);
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

  srv.tool('list_rooms', z.object({ limit:z.number().int().positive().default(50) }), async({limit})=>{
    const out=client.getRooms()
      .sort((a,b)=>(b.getLastActiveTimestamp()||0)-(a.getLastActiveTimestamp()||0))
      .slice(0,limit)
      .map(r=>({room_id:r.roomId,name:r.name}));
    return { content:[{ type:'json', json:out } ] };
  });

  srv.tool('create_room', z.object({ name:z.string().min(1), encrypted:z.boolean().default(false) }), async({name,encrypted})=>{
    const opts:any={ name,visibility:'private' };
    if(encrypted) opts.initial_state=[{ type:'m.room.encryption', state_key:'', content:{ algorithm:'m.megolm.v1.aes-sha2' } }];
    const{room_id}=await client.createRoom(opts);
    return{ content:[{ type:'json', json:{ room_id } }] };
  });

  srv.tool('list_messages', z.object({ room_id:z.string(), limit:z.number().int().positive().optional(), since:z.string().datetime().optional(), until:z.string().datetime().optional() }), async({room_id,limit,since,until})=>{
    const file=path.join(getRoomDir(room_id),`${safeFilename(room_id)}.log`);
    let lines=fs.existsSync(file)?fs.readFileSync(file,'utf8').split('\n'):[];
    if(since) lines=lines.filter(l=>l.slice(1,20)>=since);
    if(until) lines=lines.filter(l=>l.slice(1,20)<=until);
    if(limit) lines=lines.slice(-limit);
    return{ content:[{ type:'json', json:lines.filter(Boolean) }] };
  });

  srv.tool('send_message', z.object({ room_id:z.string(), message:z.string().min(1) }), async({room_id,message})=>{
    await client.sendTextMessage(room_id,message);
    return{ content:[{ type:'text', text:'sent' }] };
  });

  await srv.connect(new StdioServerTransport());

  // graceful shutdown
  const shutdown=async()=>{ logger.info('Shutting down'); try{ await client.stopClient(); }catch{} process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
})();
