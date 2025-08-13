import Pino from 'pino';
import { MatrixClient, MatrixEvent } from 'matrix-js-sdk';
import { BoundedMap, pushWithLimit } from '../utils.js';

interface KeyRequestEntry {
  last: number;
  interval: number;
  logged: boolean;
}

export class DecryptionManager {
  private pendingDecrypt: BoundedMap<string, MatrixEvent[]>;
  private requestedKeys: BoundedMap<string, KeyRequestEntry>;
  private pendingMaxPerSession: number;
  private initialInterval: number;
  private maxInterval: number;

  constructor(
    private client: MatrixClient,
    private logger: Pino.Logger,
    private uid: string,
  ) {
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

    this.pendingDecrypt = new BoundedMap<string, MatrixEvent[]>(
      pendingMaxSessions,
    );
    this.requestedKeys = new BoundedMap<string, KeyRequestEntry>(requestedMax);

    client.on('toDeviceEvent' as any, this.handleToDeviceEvent.bind(this));
  }

  private async decryptInternal(ev: MatrixEvent) {
    const cryptoApi = this.client.getCrypto();
    if (cryptoApi) {
      await (cryptoApi as any).decryptEvent(ev as any);
    }
  }

  private async handleToDeviceEvent(ev: MatrixEvent) {
    try {
      const evtType = ev.getType();
      this.logger.trace(`toDeviceEvent ${evtType} from ${ev.getSender()}`);
      await this.decryptInternal(ev);
      if (evtType === 'm.room_key' || evtType === 'm.forwarded_room_key') {
        const content = ev.getClearContent?.() || ev.getContent();
        const room_id = (content as any).room_id;
        const session_id = (content as any).session_id;
        if (room_id && session_id) {
          const key = `${room_id}|${session_id}`;
          const arr = this.pendingDecrypt.get(key);
          if (arr) {
            for (const pending of arr) {
              await this.decryptEvent(pending);
              this.client.emit('event' as any, pending);
            }
            this.pendingDecrypt.delete(key);
          }
          this.requestedKeys.delete(key);
        }
      }
    } catch (err: any) {
      this.logger.warn('Failed to handle toDeviceEvent', err);
    }
  }

  async maybeHandleRoomKeyEvent(ev: MatrixEvent) {
    const evtType = ev.getType();
    if (evtType === 'm.room_key' || evtType === 'm.forwarded_room_key') {
      const contentAny = ev.getContent() as any;
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
            this.client.emit('event' as any, pend);
          }
          this.pendingDecrypt.delete(mapKey);
        }
      }
      return true;
    }
    return false;
  }

  async decryptEvent(ev: MatrixEvent) {
    if (!ev.isEncrypted()) return;
    try {
      await this.decryptInternal(ev);
    } catch (e: any) {
      const wire =
        (ev.getWireContent?.() as any) || (ev.event as any).content || {};
      const roomId = ev.getRoomId();
      if (
        e.name === 'DecryptionError' &&
        e.code === 'MEGOLM_UNKNOWN_INBOUND_SESSION_ID'
      ) {
        this.logger.debug(
          `Unknown session for event ${ev.getId()} in room ${roomId}: session ${wire.session_id}`,
        );
      } else if (e.name === 'DecryptionError') {
        this.logger.error(
          `Decrypt: Serious decryption error for event ${ev.getId()} in room ${roomId} (Code: ${e.code || 'unknown'}): ${e.message}. Queuing for retry.`,
        );
      } else {
        this.logger.error(
          { err: e },
          `Decrypt: Unexpected error for event ${ev.getId()} in room ${roomId}: ${e.message}. Queuing for retry.`,
        );
      }
      try {
        const sessionId = (wire as any).session_id;
        const algorithm = (wire as any).algorithm;
        if (roomId && sessionId && algorithm) {
          const mapKey = `${roomId}|${sessionId}`;
          const arr = this.pendingDecrypt.get(mapKey) || [];
          pushWithLimit(arr, ev, this.pendingMaxPerSession);
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
              } else {
                this.logger.debug(
                  `Retrying room key request for session ${mapKey}`,
                );
              }
              const cryptoApi = this.client.getCrypto();
              if (cryptoApi) {
                await (cryptoApi as any).requestRoomKey(
                  { room_id: roomId, session_id: sessionId, algorithm },
                  [{ userId: sender!, deviceId: '*' }],
                );
              }
            } else {
              this.logger.trace(
                `room key for session ${mapKey} already requested recently`,
              );
            }
          }
        }
      } catch (ex: any) {
        this.logger.warn(`requestRoomKey failed: ${ex.message}`);
      }
    }
  }
}

export default DecryptionManager;
