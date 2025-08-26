'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.draftReplies = draftReplies;
async function draftReplies(context, message, askLLM) {
  const prompt = `Write three short reply drafts to the message below.
Return as:
1) Concise: <one paragraph>
2) Friendly: <one paragraph>
3) Formal: <one paragraph>
Keep each under 80 words. Avoid emojis.
Context:
${context}
Message:
${message}
`;
  const out = await askLLM(prompt);
  return out;
}
