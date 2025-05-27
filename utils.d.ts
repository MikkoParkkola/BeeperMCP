export function ensureDir(dir: string): void;
export function safeFilename(s?: string): string;
export function getRoomDir(base: string, roomId: string): string;
export const pipelineAsync: (...streams: any[]) => Promise<void>;
export class FileSessionStore {
  constructor(file: string);
  read(): any;
  getItem(key: string): any;
  setItem(key: string, val: any): void;
  removeItem(key: string): void;
}
