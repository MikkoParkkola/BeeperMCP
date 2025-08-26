'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.computeBasicStats = computeBasicStats;
function computeBasicStats(text = '', attachments = 0) {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return { words, chars: text.length, attachments };
}
