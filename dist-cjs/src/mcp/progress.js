'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.Progress = void 0;
const node_events_1 = require('node:events');
class Progress extends node_events_1.EventEmitter {
  constructor() {
    super(...arguments);
    this.cancelRequested = false;
  }
  cancel() {
    this.cancelRequested = true;
    this.emit('cancel');
  }
  emitProgress(e) {
    this.emit('progress', e);
  }
}
exports.Progress = Progress;
