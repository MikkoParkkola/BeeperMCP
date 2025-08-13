import { JSONSchema7 } from "json-schema";
import { toolsSchemas } from "../schemas/tools.js";

export const id = "send_message";
export const inputSchema = toolsSchemas.send_message as JSONSchema7;

export async function handler(input: any) {
  // Stub that would elicit approval if needed
  return {
    sent: false,
    reason: "approval_required",
    approvalForm: {
      room_id: input.room_id,
      draft_preview: input.draft_preview,
      persona_id: input.persona_id ?? null
    }
  };
}
