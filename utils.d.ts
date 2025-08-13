export function ensureDir(dir: string): void;
export function safeFilename(s?: string): string;
export function getRoomDir(base: string, roomId: string): string;
export const pipelineAsync: (...streams: any[]) => Promise<void>;
export function tailFile(file: string, limit: number): Promise<string[]>;
export class FileSessionStore {
  constructor(file: string);
  readonly length: number;
  clear(): void;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, val: string): void;
  removeItem(key: string): void;
  flush(): Promise<void>;
}
