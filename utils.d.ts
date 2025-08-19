// Minimal typings for utils.js to improve TS intellisense without migrating the file to TS.
// This file is co-located with utils.js so it applies to imports like '../utils.js' and '../../utils.js'.

export function decryptLine(line: string, secret: string): string;
export function queryLogs(
  db: any,
  roomId: string,
  limit?: number,
  since?: string,
  until?: string,
  secret?: string,
): string[];
export class FileSessionStore {
  constructor(file: string, secret?: string, flushMs?: number);
  readonly length: number;
  clear(): void;
  key(index: number): string | null;
  getItem(key: string): any;
  setItem(key: string, val: any): void;
  removeItem(key: string): void;
  flush(): Promise<void>;
}
export function ensureDir(dir: string): void;
export function getRoomDir(base: string, roomId: string): string;
export function envFlag(name: string, def?: boolean): boolean;
export function safeFilename(s?: string): string;
export function pushWithLimit<T>(arr: T[], val: T, limit: number): T[];
export class BoundedMap<K = any, V = any> extends Map<K, V> {
  constructor(limit: number);
}
export function createFileAppender(
  file: string,
  maxBytes: number,
  secret?: string,
): { queue(line: string): void; flush(): Promise<void> | void };
export function createLogWriter(
  db: any,
  secret?: string,
  flushMs?: number,
  maxEntries?: number,
): { queue(roomId: string, ts: string, line: string, eventId?: string): void; flush(): void };
export function createMediaWriter(
  db: any,
  flushMs?: number,
  maxEntries?: number,
): { queue(meta: any): void; flush(): void };
export function createMediaDownloader(
  db: any,
  queueMedia: Function,
  queueLog: Function,
  secret?: string,
  concurrency?: number,
): any;
export function openLogDb(file: string): any;
export function insertLog(
  db: any,
  roomId: string,
  ts: string,
  line: string,
  secret?: string,
  eventId?: string,
): void;
export function insertMedia(db: any, meta: any): void;
export function createFlushHelper(): {
  register(fn: () => Promise<void> | void): void;
  flush(): Promise<void>;
};
export function cleanupLogsAndMedia(
  logDir: string,
  db: any,
  days: number,
): Promise<void>;
