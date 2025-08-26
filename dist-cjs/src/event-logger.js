'use strict';
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.setupEventLogging = setupEventLogging;
const path_1 = __importDefault(require('path'));
const utils_js_1 = require('../utils.js');
const decryption_manager_js_1 = require('./decryption-manager.js');
function setupEventLogging(client, logger, opts) {
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
  const fileWriters = new Map();
  const decryption = new decryption_manager_js_1.DecryptionManager(
    client,
    logger,
    uid,
  );
  const seen = new Set();
  let testCount = 0;
  const tzTimeline = new utils_js_1.TimezoneTimeline();
  client.on('event', async (ev) => {
    if (await decryption.maybeHandleRoomKeyEvent(ev)) return;
    await decryption.decryptEvent(ev);
    if (ev.isEncrypted()) return;
    const id = ev.getId();
    if (!id) return;
    if (seen.has(id)) return;
    seen.add(id);
    const rid = ev.getRoomId() || 'meta';
    if (testRoomId && rid !== testRoomId) return;
    const type = ev.getClearType?.() || ev.getType();
    const content = ev.getClearContent?.() || ev.getContent();
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
    const dir = (0, utils_js_1.getRoomDir)(logDir, rid);
    const logf = path_1.default.join(
      dir,
      `${(0, utils_js_1.safeFilename)(rid)}.log`,
    );
    let line;
    if (type === 'm.room.message') {
      if (content.url) {
        try {
          const url = client.mxcUrlToHttp(content.url);
          const ext = path_1.default.extname(
            content.filename || content.body || '',
          );
          const fname = `${ts.replace(/[:.]/g, '')}_${(0, utils_js_1.safeFilename)(id)}${ext}`;
          const dest = path_1.default.join(
            dir,
            fname + (mediaSecret ? '.enc' : ''),
          );
          const { queued, file } = mediaDownloader.queue({
            url: url,
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
        } catch (err) {
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
      writer = (0, utils_js_1.createFileAppender)(logf, logMaxBytes, logSecret);
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
