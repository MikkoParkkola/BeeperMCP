import { JSONSchema7 } from 'json-schema';
import { toolsSchemas } from '../schemas/tools.js';
import { sample } from '../sampling.js';
import { prompts } from '../prompts.js';

export const id = 'draft_reply';
export const inputSchema = toolsSchemas.draft_reply as JSONSchema7;

export async function handler(input: any) {
  const content = `Reply to message ${input.eventId} in room ${input.room}.`;
  const prompt = prompts.brief_en.replace('{{content}}', content);
  const result = await sample({ prompt, maxTokens: 200 });
  const citations = result.citations?.length
    ? result.citations
    : [{ event_id: input.eventId, ts_utc: new Date().toISOString() }];
  return { draft: result.text, citations };
}
