'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.OpenRouterProvider = void 0;
class OpenRouterProvider {
  constructor(opts) {
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl || 'https://openrouter.ai').replace(/\/$/, '');
    this.defaultModel = opts.model;
  }
  async generateResponse(context, instructions) {
    const messages = [];
    if (instructions) messages.push({ role: 'system', content: instructions });
    messages.push(...context.messages);
    const model = context.model || this.defaultModel;
    const json = await this.request('/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, temperature: 0.2 }),
    });
    const text = json.choices?.[0]?.message?.content || '';
    return { text, model, usage: json.usage, raw: json };
  }
  async analyzeRelationship(messages) {
    const sample = messages
      .slice(-30)
      .map((m) => `${m.sender ? `<${m.sender}> ` : ''}${m.text}`)
      .join('\n');
    const instructions =
      'You analyze human relationships. Be concise. Provide a trust score 0..1, list any risk flags, and a 4-6 sentence summary.';
    const ctx = {
      messages: [
        {
          role: 'user',
          content: `Conversation sample (latest first)\n${sample}`,
        },
      ],
    };
    const out = await this.generateResponse(ctx, instructions);
    // Heuristic parsing for trust score and flags
    const trustMatch = out.text.match(
      /trust\s*score\s*[:=]\s*(0(?:\.\d+)?|1(?:\.0+)?)/i,
    );
    const trustScore = trustMatch ? Number(trustMatch[1]) : undefined;
    const flagsMatch = out.text.match(/flags?\s*[:=]\s*(.*)$/im);
    const flags = flagsMatch
      ? flagsMatch[1]
          .split(/[,;]+/)
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;
    return {
      summary: out.text.trim(),
      trustScore,
      riskFlags: flags,
    };
  }
  async detectDeception(message) {
    const instructions =
      'Detect deception or manipulation. Rate risk as low/medium/high and explain briefly. List key signals if any.';
    const ctx = {
      messages: [{ role: 'user', content: `Message:\n${message.text}` }],
    };
    const out = await this.generateResponse(ctx, instructions);
    const riskMatch = out.text.match(/\b(low|medium|high)\b/i);
    const risk = riskMatch?.[1]?.toLowerCase() || 'low';
    const sigMatch = out.text.match(/signals?\s*[:=]\s*(.*)$/im);
    const signals = sigMatch
      ? sigMatch[1]
          .split(/[,;]+/)
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;
    return { risk, rationale: out.text.trim(), signals };
  }
  async iterateResponse(previous, feedback) {
    const ctx = {
      messages: [
        {
          role: 'system',
          content: 'You refine text to better meet instructions.',
        },
        {
          role: 'user',
          content: `Original:\n${previous}\n\nImprove per feedback.`,
        },
        { role: 'user', content: `Feedback:\n${feedback}` },
      ],
    };
    return this.generateResponse(ctx);
  }
  async request(path, init = {}) {
    const url = `${this.baseUrl}${path}`;
    const headers = {
      ...init.headers,
      Authorization: `Bearer ${this.apiKey}`,
    };
    const res = await fetch(url, { ...init, headers });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`OpenRouter ${res.status}: ${txt.slice(0, 200)}`);
    }
    return res.json();
  }
}
exports.OpenRouterProvider = OpenRouterProvider;
exports.default = OpenRouterProvider;
