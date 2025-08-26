'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.sample = sample;
async function sample(req) {
  const maxTokens = req.maxTokens ?? 256;
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey) {
    try {
      const res = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          input: req.prompt,
          max_output_tokens: maxTokens,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text =
          data.output_text ??
          data.choices?.[0]?.message?.content ??
          String(data.output?.[0]?.content?.[0]?.text ?? '');
        const citations = data.citations ?? data.output?.[0]?.citations ?? [];
        return { text, citations };
      }
    } catch {
      /* ignore network errors and fall back */
    }
  }
  // Fallback: echo prompt for deterministic tests
  return { text: `LLM: ${req.prompt}`, citations: [] };
}
