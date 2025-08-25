import { spawnSync } from 'node:child_process';

export type ProviderType = 'openai' | 'anthropic' | 'openrouter' | 'ollama';

export interface ProviderConfigBase {
  type: ProviderType;
  name: string;
}

export interface OpenAIConfig extends ProviderConfigBase {
  type: 'openai';
  apiKey: string;
  baseUrl?: string;
}

export interface AnthropicConfig extends ProviderConfigBase {
  type: 'anthropic';
  apiKey: string;
  baseUrl?: string;
}

export interface OpenRouterConfig extends ProviderConfigBase {
  type: 'openrouter';
  apiKey: string;
  baseUrl?: string;
}

export interface OllamaConfig extends ProviderConfigBase {
  type: 'ollama';
  host: string;
}

export type ProviderConfig =
  | OpenAIConfig
  | AnthropicConfig
  | OpenRouterConfig
  | OllamaConfig;

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface HistoryLimits {
  maxMessages?: number; // max total messages to keep (from end)
  maxChars?: number; // max total chars across contents
}

export function truncateHistory(
  history: ChatMessage[],
  limits: HistoryLimits = { maxMessages: 20, maxChars: 16000 },
): ChatMessage[] {
  const maxM = limits.maxMessages ?? 20;
  const maxC = limits.maxChars ?? 16000;
  // Keep last maxM messages first
  let out = history.slice(-maxM);
  // Then enforce char budget from the end backwards
  let total = 0;
  for (let i = out.length - 1; i >= 0; i--) {
    total += out[i].content?.length ?? 0;
  }
  if (total <= maxC) return out;
  // Trim from the oldest side while preserving order
  const trimmed: ChatMessage[] = [];
  let running = 0;
  for (let i = out.length - 1; i >= 0; i--) {
    const m = out[i];
    const len = m.content?.length ?? 0;
    if (running + len <= maxC) {
      trimmed.push(m);
      running += len;
    } else {
      // Drop this message; continue
    }
  }
  return trimmed.reverse();
}

export function supportsStreaming(p: ProviderConfig): boolean {
  // Known streams: OpenAI, OpenRouter, Ollama; Anthropic messages API also streams
  return (
    p.type === 'openai' ||
    p.type === 'openrouter' ||
    p.type === 'ollama' ||
    p.type === 'anthropic'
  );
}

export async function* streamChat(
  p: ProviderConfig,
  model: string,
  messages: ChatMessage[],
): AsyncGenerator<string, void, void> {
  if (p.type === 'openai') {
    const base = (p.baseUrl || 'https://api.openai.com').replace(/\/$/, '');
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${p.apiKey}`,
      },
      body: JSON.stringify({ model, messages, temperature: 0.2, stream: true }),
    });
    if (!res.ok || !res.body) throw new Error(`OpenAI ${res.status}`);
    const td = new TextDecoder();
    let buffer = '';
    for await (const chunk of res.body as any) {
      buffer += td.decode(chunk as Uint8Array, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') return;
        try {
          const obj = JSON.parse(data);
          const delta = obj?.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta) yield delta;
        } catch {
          // swallow parse errors for partials
        }
      }
    }
    return;
  }
  if (p.type === 'openrouter') {
    const base = (p.baseUrl || 'https://openrouter.ai').replace(/\/$/, '');
    const res = await fetch(`${base}/api/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${p.apiKey}`,
      },
      body: JSON.stringify({ model, messages, temperature: 0.2, stream: true }),
    });
    if (!res.ok || !res.body) throw new Error(`OpenRouter ${res.status}`);
    const td = new TextDecoder();
    let buffer = '';
    for await (const chunk of res.body as any) {
      buffer += td.decode(chunk as Uint8Array, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') return;
        try {
          const obj = JSON.parse(data);
          const delta = obj?.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta) yield delta;
        } catch {
          // ignore
        }
      }
    }
    return;
  }
  if (p.type === 'ollama') {
    const host = p.host.replace(/\/$/, '');
    const res = await fetch(`${host}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: true }),
    });
    if (!res.ok || !res.body) throw new Error(`Ollama ${res.status}`);
    const td = new TextDecoder();
    let buffer = '';
    for await (const chunk of res.body as any) {
      buffer += td.decode(chunk as Uint8Array, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        try {
          const obj = JSON.parse(line);
          const text = obj?.message?.content || obj?.response || '';
          const done = Boolean(obj?.done);
          if (text) yield String(text);
          if (done) return;
        } catch {
          // ignore
        }
      }
    }
    return;
  }
  if (p.type === 'anthropic') {
    const base = (p.baseUrl || 'https://api.anthropic.com').replace(/\/$/, '');
    const system = messages.find((m) => m.role === 'system')?.content;
    const msgs = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content }));
    const res = await fetch(`${base}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': (p as AnthropicConfig).apiKey,
        'anthropic-version': '2023-06-01',
        accept: 'text/event-stream',
      },
      body: JSON.stringify({ model, system, messages: msgs, stream: true }),
    });
    if (!res.ok || !res.body) throw new Error(`Anthropic ${res.status}`);
    const td = new TextDecoder();
    let buffer = '';
    for await (const chunk of res.body as any) {
      buffer += td.decode(chunk as Uint8Array, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') return;
        try {
          const obj = JSON.parse(data);
          // anthropic messages stream: look for content_block_delta -> delta.text
          if (obj?.type === 'content_block_delta' && obj?.delta?.text) {
            yield String(obj.delta.text);
          }
        } catch {
          // ignore
        }
      }
    }
    return;
  }
  throw new Error('Unsupported provider for streaming');
}

export async function copyToClipboard(text: string): Promise<boolean> {
  // Try macOS pbcopy
  try {
    const r = spawnSync('pbcopy', [], { input: text });
    if (r.status === 0) return true;
  } catch {}
  // Try Linux xclip
  try {
    const r = spawnSync('xclip', ['-selection', 'clipboard'], { input: text });
    if (r.status === 0) return true;
  } catch {}
  // Try Linux xsel
  try {
    const r = spawnSync('xsel', ['--clipboard', '--input'], { input: text });
    if (r.status === 0) return true;
  } catch {}
  return false;
}
