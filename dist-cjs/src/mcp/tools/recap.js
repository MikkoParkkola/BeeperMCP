'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.inputSchema = exports.id = void 0;
exports.handler = handler;
const tools_js_1 = require('../schemas/tools.js');
const sampling_js_1 = require('../sampling.js');
const prompts_js_1 = require('../prompts.js');
exports.id = 'recap';
exports.inputSchema = tools_js_1.toolsSchemas.recap;
async function handler(input) {
  const content = `Summarize conversation in room ${input.room} starting from event ${input.startEventId}.`;
  const prompt = prompts_js_1.prompts.analytics_report.replace(
    '{{content}}',
    content,
  );
  const result = await (0, sampling_js_1.sample)({
    prompt,
    maxTokens: input.tokenBudget,
  });
  const citations = result.citations?.length
    ? result.citations
    : [{ event_id: input.startEventId, ts_utc: new Date().toISOString() }];
  return { summary: result.text, citations };
}
