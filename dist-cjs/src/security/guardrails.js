'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.checkGuardrails = checkGuardrails;
const doNotImpersonate = new Set([]);
const blockedKeywords = [/wire transfer/i, /ssn/i];
function checkGuardrails(text, asUser) {
  if (asUser && doNotImpersonate.has(asUser)) {
    return { ok: false, reason: 'do_not_impersonate' };
  }
  for (const rx of blockedKeywords) {
    if (rx.test(text)) return { ok: false, reason: 'blocked_keyword' };
  }
  return { ok: true };
}
