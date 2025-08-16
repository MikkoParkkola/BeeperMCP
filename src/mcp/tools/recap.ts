import { JSONSchema7 } from 'json-schema';
import { toolsSchemas } from '../schemas/tools.js';
import { sample } from '../sampling.js';
import { prompts } from '../prompts.js';

export const id = 'recap';
export const inputSchema = toolsSchemas.recap as JSONSchema7;

export async function handler(input: any) {
  const content = `Summarize conversation in room ${input.room} starting from event ${input.startEventId}.`;
  const prompt = prompts.analytics_report.replace('{{content}}', content);
  const result = await sample({ prompt, maxTokens: input.tokenBudget });
  const citations = result.citations?.length
    ? result.citations
    : [{ event_id: input.startEventId, ts_utc: new Date().toISOString() }];
  return { summary: result.text, citations };
}
