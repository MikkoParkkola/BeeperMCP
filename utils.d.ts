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
  queue: (roomId: string, ts: string, line: string) => void;
  flush: () => void;
};
export function insertLogs(
  db: any,
  entries: { roomId: string; ts: string; line: string }[],
  secret?: string,
): void;
export function insertLog(
  db: any,
  roomId: string,
  ts: string,
  line: string,
  secret?: string,
): void;
export function queryLogs(
  db: any,
  roomId: string,
  limit?: number,
  since?: string,
  until?: string,
  secret?: string,
): string[];
export function pushWithLimit<T>(arr: T[], val: T, limit: number): T[];
export class BoundedMap<K, V> extends Map<K, V> {
  constructor(limit: number);
  set(key: K, val: V): this;
}
export class FileSessionStore {
  constructor(file: string, secret?: string);
  readonly length: number;
  clear(): void;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, val: string): void;
  removeItem(key: string): void;
  flush(): Promise<void>;
}
