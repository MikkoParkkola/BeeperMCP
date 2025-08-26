'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.DecryptionManager = void 0;
const utils_js_1 = require('../utils.js');
const metrics_js_1 = require('./obs/metrics.js');
class DecryptionManager {
  constructor(client, logger, uid) {
    this.client = client;
    this.logger = logger;
    this.uid = uid;
    const pendingMaxSessions = Number(
      process.env.PENDING_DECRYPT_MAX_SESSIONS ?? '1000',
    );
    this.pendingMaxPerSession = Number(
      process.env.PENDING_DECRYPT_MAX_PER_SESSION ?? '100',
    );
    const requestedMax = Number(process.env.REQUESTED_KEYS_MAX ?? '1000');
    this.initialInterval = Number(
      process.env.KEY_REQUEST_INTERVAL_MS ?? '1000',
    );
    this.maxInterval = Number(
      process.env.KEY_REQUEST_MAX_INTERVAL_MS ?? '300000',
    );
    this.pendingDecrypt = new utils_js_1.BoundedMap(pendingMaxSessions);
    this.requestedKeys = new utils_js_1.BoundedMap(requestedMax);
    client.on('toDeviceEvent', this.handleToDeviceEvent.bind(this));
  }
  async decryptInternal(ev) {
    const cryptoApi = this.client.getCrypto();
    if (cryptoApi) {
      await cryptoApi.decryptEvent(ev);
      (0, metrics_js_1.incr)('decrypt_ok');
    }
  }
  async handleToDeviceEvent(ev) {
    try {
      const evtType = ev.getType();
      this.logger.trace(`toDeviceEvent ${evtType} from ${ev.getSender()}`);
      await this.decryptInternal(ev);
      if (evtType === 'm.room_key' || evtType === 'm.forwarded_room_key') {
        const content = ev.getClearContent?.() || ev.getContent();
        const room_id = content.room_id;
        const session_id = content.session_id;
        if (room_id && session_id) {
          const key = `${room_id}|${session_id}`;
          const arr = this.pendingDecrypt.get(key);
          if (arr) {
            for (const pending of arr) {
              await this.decryptEvent(pending);
              this.client.emit('event', pending);
            }
            this.pendingDecrypt.delete(key);
          }
          this.requestedKeys.delete(key);
        }
      }
    } catch (err) {
      this.logger.warn('Failed to handle toDeviceEvent', err);
    }
  }
  async maybeHandleRoomKeyEvent(ev) {
    const evtType = ev.getType();
    if (evtType === 'm.room_key' || evtType === 'm.forwarded_room_key') {
      const contentAny = ev.getContent();
      const room_id = contentAny.room_id;
      const session_id = contentAny.session_id;
      if (room_id && session_id) {
        const mapKey = `${room_id}|${session_id}`;
        this.logger.trace(
          `timeline key event ${evtType} for session ${mapKey}`,
        );
        const arr = this.pendingDecrypt.get(mapKey);
        if (arr) {
          for (const pend of arr) {
            await this.decryptEvent(pend);
            this.client.emit('event', pend);
          }
          this.pendingDecrypt.delete(mapKey);
        }
      }
      return true;
    }
    return false;
  }
  async decryptEvent(ev) {
    if (!ev.isEncrypted()) return;
    try {
      await this.decryptInternal(ev);
    } catch (e) {
      const wire = ev.getWireContent?.() || ev.event.content || {};
      const roomId = ev.getRoomId();
      if (
        e.name === 'DecryptionError' &&
        e.code === 'MEGOLM_UNKNOWN_INBOUND_SESSION_ID'
      ) {
        this.logger.debug(
          `Unknown session for event ${ev.getId()} in room ${roomId}: session ${wire.session_id}`,
        );
        (0, metrics_js_1.incr)('decrypt_missing_session');
      } else if (e.name === 'DecryptionError') {
        this.logger.error(
          `Decrypt: Serious decryption error for event ${ev.getId()} in room ${roomId} (Code: ${e.code || 'unknown'}): ${e.message}. Queuing for retry.`,
        );
        (0, metrics_js_1.incr)('decrypt_error');
      } else {
        this.logger.error(
          { err: e },
          `Decrypt: Unexpected error for event ${ev.getId()} in room ${roomId}: ${e.message}. Queuing for retry.`,
        );
        (0, metrics_js_1.incr)('decrypt_error');
      }
      try {
        const sessionId = wire.session_id;
        const algorithm = wire.algorithm;
        if (roomId && sessionId && algorithm) {
          const mapKey = `${roomId}|${sessionId}`;
          const arr = this.pendingDecrypt.get(mapKey) || [];
          (0, utils_js_1.pushWithLimit)(arr, ev, this.pendingMaxPerSession);
          this.pendingDecrypt.set(mapKey, arr);
          const sender = ev.getSender();
          if (sender === this.uid) {
            this.logger.info(
              `Decrypt: Missing keys for our own event ${ev.getId()} in room ${roomId}; not requesting from ourselves.`,
            );
          } else {
            const entry = this.requestedKeys.get(mapKey) || {
              last: 0,
              interval: this.initialInterval,
              logged: false,
            };
            const now = Date.now();
            if (now - entry.last >= entry.interval) {
              entry.last = now;
              entry.interval = Math.min(entry.interval * 2, this.maxInterval);
              this.requestedKeys.set(mapKey, entry);
              if (!entry.logged) {
                this.logger.warn(
                  `Requesting missing room key for session ${mapKey}`,
                );
                entry.logged = true;
                (0, metrics_js_1.incr)('key_request');
              } else {
                this.logger.debug(
                  `Retrying room key request for session ${mapKey}`,
                );
                (0, metrics_js_1.incr)('key_request_retry');
              }
              const cryptoApi = this.client.getCrypto();
              if (cryptoApi) {
                await cryptoApi.requestRoomKey(
                  { room_id: roomId, session_id: sessionId, algorithm },
                  [{ userId: sender, deviceId: '*' }],
                );
              }
            } else {
              this.logger.trace(
                `room key for session ${mapKey} already requested recently`,
              );
            }
          }
        }
      } catch (ex) {
        this.logger.warn(`requestRoomKey failed: ${ex.message}`);
      }
    }
  }
}
exports.DecryptionManager = DecryptionManager;
exports.default = DecryptionManager;
