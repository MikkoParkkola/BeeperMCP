import path from 'path';
import Pino from 'pino';
import { MatrixClient, MatrixEvent } from 'matrix-js-sdk';
import {
  createFileAppender,
  getRoomDir,
  safeFilename,
  BoundedMap,
  pushWithLimit,
} from '../utils.js';
import type { createMediaDownloader } from '../utils.js';

export function setupEventLogging(
  client: MatrixClient,
  logger: Pino.Logger,
  opts: {
    logDir: string;
    logMaxBytes: number;
    logSecret?: string;
    mediaSecret?: string;
    mediaDownloader: ReturnType<typeof createMediaDownloader>;
    queueLog: (
      roomId: string,
      ts: string,
      line: string,
      eventId?: string,
    ) => void;
    testRoomId?: string | null;
    testLimit: number;
    uid: string;
    shutdown: () => Promise<void>;
    pendingDecryptMaxSessions: number;
    pendingDecryptMaxPerSession: number;
    requestedKeysMax: number;
    keyRequestIntervalMs: number;
    keyRequestMaxIntervalMs: number;
  },
) {
  const {
    logDir,
    logMaxBytes,
    logSecret,
    mediaSecret,
    mediaDownloader,
    queueLog,
    testRoomId,
    testLimit,
    uid,
    shutdown,
    pendingDecryptMaxSessions,
    pendingDecryptMaxPerSession,
    requestedKeysMax,
    keyRequestIntervalMs,
    keyRequestMaxIntervalMs,
  } = opts;
  const INITIAL_REQUEST_INTERVAL_MS = keyRequestIntervalMs;
  const MAX_REQUEST_INTERVAL_MS = keyRequestMaxIntervalMs;

  const pendingDecrypt = new BoundedMap<string, MatrixEvent[]>(
    pendingDecryptMaxSessions,
  );
  const requestedKeys = new BoundedMap<
    string,
    { last: number; interval: number; logged: boolean }
  >(requestedKeysMax);

  const fileWriters = new Map<string, ReturnType<typeof createFileAppender>>();

  client.on('toDeviceEvent' as any, async (ev: MatrixEvent) => {
    try {
      const evtType = ev.getType();
      logger.trace(`toDeviceEvent ${evtType} from ${ev.getSender()}`);
      const cryptoApi = client.getCrypto();
      if (cryptoApi) {
        await (cryptoApi as any).decryptEvent(ev as any);
      }
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
              client.emit('event' as any, pending);
            }
            pendingDecrypt.delete(key);
          }
          requestedKeys.delete(key);
        }
      }
    } catch (err: any) {
      logger.warn('Failed to handle toDeviceEvent', err);
    }
  });

  const decryptEvent = async (ev: MatrixEvent) => {
    if (!ev.isEncrypted()) return;
    try {
      const cryptoApi = client.getCrypto();
      if (cryptoApi) {
        await (cryptoApi as any).decryptEvent(ev as any);
      }
    } catch (e: any) {
      const wire =
        (ev.getWireContent?.() as any) || (ev.event as any).content || {};
      const roomId = ev.getRoomId();
      if (
        e.name === 'DecryptionError' &&
        e.code === 'MEGOLM_UNKNOWN_INBOUND_SESSION_ID'
      ) {
        logger.debug(
          `Unknown session for event ${ev.getId()} in room ${roomId}: session ${wire.session_id}`,
        );
      } else if (e.name === 'DecryptionError') {
        logger.error(
          `Decrypt: Serious decryption error for event ${ev.getId()} in room ${roomId} (Code: ${e.code || 'unknown'}): ${e.message}. Queuing for retry.`,
        );
      } else {
        logger.error(
          { err: e },
          `Decrypt: Unexpected error for event ${ev.getId()} in room ${roomId}: ${e.message}. Queuing for retry.`,
        );
      }
      try {
        const sessionId = (wire as any).session_id;
        const algorithm = (wire as any).algorithm;
        if (roomId && sessionId && algorithm) {
          const mapKey = `${roomId}|${sessionId}`;
          const arr = pendingDecrypt.get(mapKey) || [];
          pushWithLimit(arr, ev, pendingDecryptMaxPerSession);
          pendingDecrypt.set(mapKey, arr);
          const sender = ev.getSender();
          if (sender === uid) {
            logger.info(
              `Decrypt: Missing keys for our own event ${ev.getId()} in room ${roomId}; not requesting from ourselves.`,
            );
          } else {
            const entry = requestedKeys.get(mapKey) || {
              last: 0,
              interval: INITIAL_REQUEST_INTERVAL_MS,
              logged: false,
            };
            const now = Date.now();
            if (now - entry.last >= entry.interval) {
              entry.last = now;
              entry.interval = Math.min(
                entry.interval * 2,
                MAX_REQUEST_INTERVAL_MS,
              );
              requestedKeys.set(mapKey, entry);
              if (!entry.logged) {
                logger.warn(
                  `Requesting missing room key for session ${mapKey}`,
                );
                entry.logged = true;
              } else {
                logger.debug(`Retrying room key request for session ${mapKey}`);
              }
              const cryptoApi = client.getCrypto();
              if (cryptoApi) {
                await (cryptoApi as any).requestRoomKey(
                  { room_id: roomId, session_id: sessionId, algorithm },
                  [{ userId: sender!, deviceId: '*' }],
                );
              }
            } else {
              logger.trace(
                `room key for session ${mapKey} already requested recently`,
              );
            }
          }
        }
      } catch (ex: any) {
        logger.warn(`requestRoomKey failed: ${ex.message}`);
      }
    }
  };

  const seen = new Set<string>();
  let testCount = 0;
  client.on('event' as any, async (ev: any) => {
    await decryptEvent(ev);
    if (ev.isEncrypted()) return;
    const id = ev.getId();
    if (seen.has(id)) return;
    seen.add(id);
    const rid = ev.getRoomId() || 'meta';
    if (testRoomId && rid !== testRoomId) return;
    const type = ev.getClearType?.() || ev.getType();
    const content = ev.getClearContent?.() || ev.getContent();
    const ts = new Date(ev.getTs() || Date.now()).toISOString();
    const dir = getRoomDir(logDir, rid);
    const logf = path.join(dir, `${safeFilename(rid)}.log`);
    let line: string;
    if (type === 'm.room.message') {
      if (content.url) {
        try {
          const url = client.mxcUrlToHttp(content.url);
          const ext = path.extname(content.filename || content.body || '');
          const fname = `${ts.replace(/[:.]/g, '')}_${safeFilename(id)}${ext}`;
          const dest = path.join(dir, fname + (mediaSecret ? '.enc' : ''));
          const { queued, file } = mediaDownloader.queue({
            url: url as string,
            dest,
            roomId: rid,
            eventId: id,
            ts,
            sender: ev.getSender(),
            type: content.info?.mimetype,
            size: content.info?.size,
          });
          line = queued
            ? `[${ts}] <${ev.getSender()}> [media pending] ${file}`
            : `[${ts}] <${ev.getSender()}> [media cached] ${file}`;
        } catch (err: any) {
          logger.warn('Failed to queue media download', err);
          line = `[${ts}] <${ev.getSender()}> [media download failed]`;
        }
      } else {
        line = `[${ts}] <${ev.getSender()}> ${content.body || '[non-text]'}`;
      }
    } else {
      line = `[${ts}] <${ev.getSender()}> [${type}]`;
    }
    let writer = fileWriters.get(logf);
    if (!writer) {
      writer = createFileAppender(logf, logMaxBytes, logSecret);
      fileWriters.set(logf, writer);
    }
    writer.queue(line);
    queueLog(rid, ts, line, id);
    if (testLimit > 0) {
      testCount++;
      if (testCount >= testLimit) {
        logger.info(
          `Test limit of ${testLimit} events reached, shutting down.`,
        );
        await shutdown();
      }
    }
  });
  return {
    flush: async () => {
      for (const w of fileWriters.values()) await w.flush();
    },
  };
}
