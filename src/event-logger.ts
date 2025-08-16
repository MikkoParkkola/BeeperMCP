import path from 'path';
import Pino from 'pino';
import type { MatrixClient, MatrixEvent } from 'matrix-js-sdk';
import {
  createFileAppender,
  getRoomDir,
  safeFilename,
  TimezoneTimeline,
} from '../utils.js';
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
  const tzTimeline = new TimezoneTimeline();
  client.on('event' as any, async (ev: MatrixEvent) => {
    if (await decryption.maybeHandleRoomKeyEvent(ev)) return;
    await decryption.decryptEvent(ev);
    if (ev.isEncrypted()) return;
    const id = ev.getId();
    if (!id) return;
    if (seen.has(id)) return;
    seen.add(id);
    const rid = ev.getRoomId() || 'meta';
    if (testRoomId && rid !== testRoomId) return;
    const type = (ev as any).getClearType?.() || ev.getType();
    const content = (ev as any).getClearContent?.() || ev.getContent();
    const tsDate = new Date(ev.getTs() || Date.now());
    const ts = tsDate.toISOString();
    if (typeof content?.client_tz === 'string') {
      const since = content.client_tz_since || ts;
      try {
        tzTimeline.set(content.client_tz, since);
      } catch {
        // ignore invalid time zones
      }
    }
    const tzKeys = tzTimeline.localKeys(tsDate);
    const dir = getRoomDir(logDir, rid);
    const logf = path.join(dir, `${safeFilename(rid)}.log`);
    let line: string;
    if (type === 'm.room.message') {
      if (content.url) {
        try {
          const url = client.mxcUrlToHttp(content.url as string);
          const ext = path.extname(content.filename || content.body || '');
          const fname = `${ts.replace(/[:.]/g, '')}_${safeFilename(id)}${ext}`;
          const dest = path.join(dir, fname + (mediaSecret ? '.enc' : ''));
          const { queued, file } = mediaDownloader.queue({
            url: url as string,
            dest,
            roomId: rid,
            eventId: id,
            ts,
            sender: ev.getSender()!,
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
    const payload = {
      line,
      tz: tzTimeline.get(tsDate),
      tz_keys: tzKeys,
    };
    writer.queue(line);
    queueLog(rid, ts, JSON.stringify(payload), id);
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

// If you'd like me to continue wiring features, consider adding these files
// (or confirming they already exist in the repo/chat):
// - Postgres: messages schema (CREATE TABLE messages ...)
// - scripts/migrate.ts
// - src/ingest/matrix.ts
// - src/index/reembed.ts (already provided but may need expansion)
// - src/mcp/tools/sentimentTrends.ts
// - src/mcp/tools/sentimentDistribution.ts
// - src/mcp/tools/messageContext.ts
// - src/mcp/tools/mediaProxy.ts
// - src/decryption-manager.js (implementation expected by this file)
//
// Additional recommended files to add now (high priority to enable a full build/run):
// - utils.js
// - mcp-tools.js
// - src/mcp/resources.ts
// - src/mcp/server.ts
