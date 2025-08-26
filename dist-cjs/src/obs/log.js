'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.log = log;
function log(kind, payload, correlationId) {
  const rec = {
    ts: new Date().toISOString(),
    kind,
    correlationId: correlationId ?? null,
    payload,
  };
  console.log(JSON.stringify(rec));
}
