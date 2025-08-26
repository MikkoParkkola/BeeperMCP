'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.requestApproval = requestApproval;
async function requestApproval(form) {
  // Stub: always deny
  return { ...form, send: false };
}
