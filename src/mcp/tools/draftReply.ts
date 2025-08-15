import { JSONSchema7 } from 'json-schema';
import { toolsSchemas } from '../schemas/tools.js';

export const id = 'draft_reply';
export const inputSchema = toolsSchemas.draft_reply as JSONSchema7;

export async function handler() {
  return { draft: 'TODO: draft reply', citations: [] };
}
