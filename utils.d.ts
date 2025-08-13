export function ensureDir(dir: string): void;
export function safeFilename(s?: string): string;
export function getRoomDir(base: string, roomId: string): string;
export const pipelineAsync: (...streams: any[]) => Promise<void>;
export function envFlag(name: string, def?: boolean): boolean;
export function tailFile(
  file: string,
  limit: number,
  secret?: string,
): Promise<string[]>;
export function encryptFileStream(
  src: NodeJS.ReadableStream,
  dest: string,
  secret: string,
): Promise<void>;
export function decryptFile(file: string, secret: string): Promise<Buffer>;
export function appendWithRotate(
  file: string,
  line: string,
  maxBytes: number,
  secret?: string,
): Promise<void>;
export function openLogDb(file: string): any;
export function createLogWriter(
  db: any,
  secret?: string,
  flushMs?: number,
  maxEntries?: number,
): {
  queue: (roomId: string, ts: string, line: string, eventId?: string) => void;
  flush: () => void;
};
export function insertLogs(
  db: any,
  entries: { roomId: string; ts: string; line: string; eventId?: string }[],
  secret?: string,
): void;
export function insertLog(
  db: any,
  roomId: string,
  ts: string,
  line: string,
  secret?: string,
  eventId?: string,
): void;
export function queryLogs(
  db: any,
  roomId: string,
  limit?: number,
  since?: string,
  until?: string,
  secret?: string,
): string[];
export function insertMedia(
  db: any,
  meta: {
    eventId: string;
    roomId: string;
    ts: string;
    file: string;
    type?: string;
    size?: number;
    hash?: string;
  },
): void;
export function insertMedias(
  db: any,
  entries: {
    eventId: string;
    roomId: string;
    ts: string;
    file: string;
    type?: string;
    size?: number;
    hash?: string;
  }[],
): void;
export function queryMedia(
  db: any,
  roomId: string,
  limit?: number,
): {
  eventId: string;
  ts: string;
  file: string;
  type: string | null;
  size: number | null;
  hash: string | null;
}[];
export function createMediaWriter(
  db: any,
  flushMs?: number,
  maxEntries?: number,
): {
  queue: (meta: {
    eventId: string;
    roomId: string;
    ts: string;
    file: string;
    type?: string;
    size?: number;
    hash?: string;
  }) => void;
  flush: () => void;
};
export function createMediaDownloader(
  db: any,
  queueMedia: (meta: {
    eventId: string;
    roomId: string;
    ts: string;
    file: string;
    type?: string;
    size?: number;
    hash?: string;
  }) => void,
  queueLog: (
    roomId: string,
    ts: string,
    line: string,
    eventId?: string,
  ) => void,
  secret?: string,
  concurrency?: number,
): {
  queue: (task: {
    url: string;
    dest: string;
    roomId: string;
    eventId: string;
    ts: string;
    sender: string;
    type?: string;
    size?: number;
    hash?: string;
  }) => void;
  flush: () => Promise<void>;
};
export function pushWithLimit<T>(arr: T[], val: T, limit: number): T[];
export class BoundedMap<K, V> extends Map<K, V> {
  constructor(limit: number);
  set(key: K, val: V): this;
}
export class FileSessionStore {
  constructor(file: string, secret?: string, flushMs?: number);
  readonly length: number;
  clear(): void;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, val: string): void;
  removeItem(key: string): void;
  flush(): Promise<void>;
}
export function createFlushHelper(): {
  register: (fn: () => any) => void;
  flush: () => Promise<void>;
};
export function cleanupLogsAndMedia(
  logDir: string,
  db: any,
  days: number,
): Promise<void>;
