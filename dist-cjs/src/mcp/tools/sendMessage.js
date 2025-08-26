'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.inputSchema = exports.id = void 0;
exports.handler = handler;
exports.__setSendFn = __setSendFn;
const tools_js_1 = require('../schemas/tools.js');
const rateLimit_js_1 = require('../../security/rateLimit.js');
const guardrails_js_1 = require('../../security/guardrails.js');
const sanitize_js_1 = require('../../security/sanitize.js');
const config_js_1 = require('../../config.js');
const client_js_1 = require('../../matrix/client.js');
const metrics_js_1 = require('../../obs/metrics.js');
exports.id = 'send_message';
exports.inputSchema = tools_js_1.toolsSchemas.send_message;
async function handler(input) {
  (0, rateLimit_js_1.rateLimiter)(
    'mcp_tools_send',
    config_js_1.config.mcp.rateLimits.send,
  );
  const draft = String(input.draft_preview ?? '');
  const guard = (0, guardrails_js_1.checkGuardrails)(draft, input.persona_id);
  if (!guard.ok) {
    return { sent: false, reason: guard.reason };
  }
  if (!input.send) {
    return {
      sent: false,
      reason: 'approval_required',
      approvalForm: {
        room_id: input.room_id,
        draft_preview: draft,
        persona_id: input.persona_id ?? null,
      },
    };
  }
  const text = (0, sanitize_js_1.sanitizeText)(draft);
  const fn = sendFn || client_js_1.sendMessage;
  const t0 = Date.now();
  let attempt = 0;
  const maxAttempts = Number(process.env.SEND_MAX_ATTEMPTS ?? 3);
  const baseDelay = Number(process.env.SEND_RETRY_BASE_MS ?? 250);
  // retry with simple exponential backoff on 429/5xx
  // swallow only retryable errors
  for (;;) {
    try {
      (0, metrics_js_1.incr)('mcp.send.attempt');
      const res = await fn(input.room_id, text);
      (0, metrics_js_1.incr)('mcp.send.ok');
      (0, metrics_js_1.recordDuration)('mcp.send.dur_ms', Date.now() - t0);
      return { sent: true, response: res ?? null };
    } catch (e) {
      attempt += 1;
      const msg = String(e?.message || e);
      const retryable = /429|5\d\d|rate|timeout|temporarily|network/i.test(msg);
      if (!retryable || attempt >= maxAttempts) {
        (0, metrics_js_1.incr)('mcp.send.err');
        (0, metrics_js_1.recordDuration)('mcp.send.dur_ms', Date.now() - t0);
        return { sent: false, reason: 'send_failed', error: msg };
      }
      (0, metrics_js_1.incr)('mcp.send.retry');
      const delay =
        baseDelay * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 50);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
let sendFn = null;
function __setSendFn(fn) {
  sendFn = fn;
}
