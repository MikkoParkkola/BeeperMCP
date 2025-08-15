import { JSONSchema7 } from 'json-schema';
import { toolsSchemas } from '../schemas/tools.js';
import { rateLimiter } from '../../security/rateLimit.js';
import { checkGuardrails } from '../../security/guardrails.js';
import { sanitizeText } from '../../security/sanitize.js';
import { config } from '../../config/analytics.js';
import { sendMessage as matrixSend } from '../../matrix/client.js';

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
  await (sendFn || matrixSend)(input.room_id, text);
  return { sent: true };
}

let sendFn: ((room: string, text: string) => Promise<any>) | null = null;
export function __setSendFn(fn: (room: string, text: string) => Promise<any>) {
  sendFn = fn;
}
