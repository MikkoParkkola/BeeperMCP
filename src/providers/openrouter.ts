export interface ConversationMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ConversationContext {
  messages: ConversationMessage[];
  model?: string;
}

export interface AIResponse {
  text: string;
  model?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  raw?: any;
}

export interface Message {
  sender?: string;
  text: string;
  ts?: string | number | Date;
}

export interface RelationshipAnalysis {
  summary: string;
  trustScore?: number; // 0..1
  riskFlags?: string[];
}

export interface DeceptionAnalysis {
  risk: 'low' | 'medium' | 'high';
  rationale: string;
  signals?: string[];
}

export class OpenRouterProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultModel: string;

  constructor(opts: { apiKey: string; baseUrl?: string; model: string }) {
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl || 'https://openrouter.ai').replace(/\/$/, '');
    this.defaultModel = opts.model;
  }

  async generateResponse(
    context: ConversationContext,
    instructions?: string,
  ): Promise<AIResponse> {
    const messages: ConversationMessage[] = [];
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

  async analyzeRelationship(
    messages: Message[],
  ): Promise<RelationshipAnalysis> {
    const sample = messages
      .slice(-30)
      .map((m) => `${m.sender ? `<${m.sender}> ` : ''}${m.text}`)
      .join('\n');
    const instructions =
      'You analyze human relationships. Be concise. Provide a trust score 0..1, list any risk flags, and a 4-6 sentence summary.';
    const ctx: ConversationContext = {
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

  async detectDeception(message: Message): Promise<DeceptionAnalysis> {
    const instructions =
      'Detect deception or manipulation. Rate risk as low/medium/high and explain briefly. List key signals if any.';
    const ctx: ConversationContext = {
      messages: [{ role: 'user', content: `Message:\n${message.text}` }],
    };
    const out = await this.generateResponse(ctx, instructions);
    const riskMatch = out.text.match(/\b(low|medium|high)\b/i);
    const risk =
      (riskMatch?.[1]?.toLowerCase() as 'low' | 'medium' | 'high') || 'low';
    const sigMatch = out.text.match(/signals?\s*[:=]\s*(.*)$/im);
    const signals = sigMatch
      ? sigMatch[1]
          .split(/[,;]+/)
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;
    return { risk, rationale: out.text.trim(), signals };
  }

  async iterateResponse(
    previous: string,
    feedback: string,
  ): Promise<AIResponse> {
    const ctx: ConversationContext = {
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

  private async request(path: string, init: any = {}): Promise<any> {
    const url = `${this.baseUrl}${path}`;
    const headers = {
      ...(init.headers as any),
      Authorization: `Bearer ${this.apiKey}`,
    } as Record<string, string>;
    const res = await fetch(url, { ...init, headers });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`OpenRouter ${res.status}: ${txt.slice(0, 200)}`);
    }
    return res.json();
  }
}

export default OpenRouterProvider;
