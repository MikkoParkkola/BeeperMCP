import path from 'path';
import Pino from 'pino';
import { MatrixClient } from 'matrix-js-sdk';
import { createFileAppender, getRoomDir, safeFilename } from '../utils.js';
import { DecryptionManager } from './decryption-manager.js';
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
  } = opts;

  const fileWriters = new Map<string, ReturnType<typeof createFileAppender>>();
  const decryption = new DecryptionManager(client, logger, uid);

  const seen = new Set<string>();
  let testCount = 0;
  client.on('event' as any, async (ev: any) => {
    if (await decryption.maybeHandleRoomKeyEvent(ev)) return;
    await decryption.decryptEvent(ev);
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
