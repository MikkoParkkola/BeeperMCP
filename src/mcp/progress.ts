import { EventEmitter } from "node:events";

export interface ProgressEvent {
  id: string;
  kind: string;
  progress: number; // 0..1
  message?: string;
}

export class Progress extends EventEmitter {
  cancelRequested = false;
  cancel() {
    this.cancelRequested = true;
    this.emit("cancel");
  }
  emitProgress(e: ProgressEvent) {
    this.emit("progress", e);
  }
}
