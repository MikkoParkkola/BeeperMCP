'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.inputSchema = exports.id = void 0;
exports.handler = handler;
const tools_js_1 = require('../schemas/tools.js');
const sampling_js_1 = require('../sampling.js');
const prompts_js_1 = require('../prompts.js');
exports.id = 'draft_reply';
exports.inputSchema = tools_js_1.toolsSchemas.draft_reply;
async function handler(input) {
  const content = `Reply to message ${input.eventId} in room ${input.room}.`;
  const prompt = prompts_js_1.prompts.brief_en.replace('{{content}}', content);
  const result = await (0, sampling_js_1.sample)({ prompt, maxTokens: 200 });
  const citations = result.citations?.length
    ? result.citations
    : [{ event_id: input.eventId, ts_utc: new Date().toISOString() }];
  return { draft: result.text, citations };
}
