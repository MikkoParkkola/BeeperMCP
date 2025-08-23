import { JSONSchema7 } from 'json-schema';
import { toolsSchemas } from '../schemas/tools.js';
import { rateLimiter } from '../../security/rateLimit.js';
import { checkGuardrails } from '../../security/guardrails.js';
import { sanitizeText } from '../../security/sanitize.js';
import { config } from '../../config.js';
import { sendMessage as matrixSend } from '../../matrix/client.js';
import { incr, recordDuration } from '../../obs/metrics.js';

export const id = 'send_message';
export const inputSchema = toolsSchemas.send_message as JSONSchema7;

export async function handler(input: any) {
  rateLimiter('mcp_tools_send', config.mcp.rateLimits.send);
  const draft = String(input.draft_preview ?? '');
  const guard = checkGuardrails(draft, input.persona_id);
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
  const text = sanitizeText(draft);
  const fn = sendFn || matrixSend;
  const t0 = Date.now();
  let attempt = 0;
  const maxAttempts = Number(process.env.SEND_MAX_ATTEMPTS ?? 3);
  const baseDelay = Number(process.env.SEND_RETRY_BASE_MS ?? 250);
  // retry with simple exponential backoff on 429/5xx
  // swallow only retryable errors
  for (;;) {
    try {
      incr('mcp.send.attempt');
      const res = await fn(input.room_id, text);
      incr('mcp.send.ok');
      recordDuration('mcp.send.dur_ms', Date.now() - t0);
      return { sent: true, response: res ?? null };
    } catch (e: any) {
      attempt += 1;
      const msg = String(e?.message || e);
      const retryable = /429|5\d\d|rate|timeout|temporarily|network/i.test(msg);
      if (!retryable || attempt >= maxAttempts) {
        incr('mcp.send.err');
        recordDuration('mcp.send.dur_ms', Date.now() - t0);
        return { sent: false, reason: 'send_failed', error: msg };
      }
      incr('mcp.send.retry');
      const delay =
        baseDelay * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 50);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

let sendFn: ((room: string, text: string) => Promise<any>) | null = null;
export function __setSendFn(fn: (room: string, text: string) => Promise<any>) {
  sendFn = fn;
}
