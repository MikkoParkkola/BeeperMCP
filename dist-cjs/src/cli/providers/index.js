'use strict';
var __createBinding =
  (this && this.__createBinding) ||
  (Object.create
    ? function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (
          !desc ||
          ('get' in desc ? !m.__esModule : desc.writable || desc.configurable)
        ) {
          desc = {
            enumerable: true,
            get: function () {
              return m[k];
            },
          };
        }
        Object.defineProperty(o, k2, desc);
      }
    : function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
      });
var __setModuleDefault =
  (this && this.__setModuleDefault) ||
  (Object.create
    ? function (o, v) {
        Object.defineProperty(o, 'default', { enumerable: true, value: v });
      }
    : function (o, v) {
        o['default'] = v;
      });
var __importStar =
  (this && this.__importStar) ||
  (function () {
    var ownKeys = function (o) {
      ownKeys =
        Object.getOwnPropertyNames ||
        function (o) {
          var ar = [];
          for (var k in o)
            if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
          return ar;
        };
      return ownKeys(o);
    };
    return function (mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null)
        for (var k = ownKeys(mod), i = 0; i < k.length; i++)
          if (k[i] !== 'default') __createBinding(result, mod, k[i]);
      __setModuleDefault(result, mod);
      return result;
    };
  })();
Object.defineProperty(exports, '__esModule', { value: true });
exports.listModelsForProvider = listModelsForProvider;
exports.sendChat = sendChat;
// Basic proxy + retry + timeout helpers for provider requests
let proxyInitialized = false;
async function ensureProxyDispatcher() {
  if (proxyInitialized) return;
  proxyInitialized = true;
  const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  if (!proxy) return;
  try {
    // Use undici's ProxyAgent if available to respect proxy envs
    const undici = await Promise.resolve().then(() =>
      __importStar(require('undici')),
    );
    if (undici?.ProxyAgent && undici?.setGlobalDispatcher) {
      const agent = new undici.ProxyAgent(proxy);
      undici.setGlobalDispatcher(agent);
    }
  } catch {
    // Best-effort; if undici not available, skip
  }
}
function withTimeout(init, timeoutMs) {
  const controller = new AbortController();
  const id = setTimeout(
    () => controller.abort(new Error('timeout')),
    Math.max(1, timeoutMs),
  );
  const onFinally = () => clearTimeout(id);
  // Attach a marker so callers can clear if they want (we clear in fetch wrapper)
  controller._onFinally = onFinally;
  return { ...(init || {}), signal: controller.signal };
}
function isRetryableStatus(status) {
  return status === 429 || (status >= 500 && status < 600);
}
async function fetchWithRetry(url, init, opts) {
  await ensureProxyDispatcher();
  const retries = Math.max(0, opts?.retries ?? 2);
  const base = Math.max(50, opts?.baseDelayMs ?? 250);
  const timeout = Math.max(100, opts?.timeoutMs ?? 10000);
  let attempt = 0;
  for (;;) {
    const req = withTimeout(init, timeout);
    try {
      const controller = req.signal?.constructor ? req.signal : null;
      const timeoutPromise = new Promise((_resolve, reject) => {
        const tid = setTimeout(() => {
          try {
            controller?.abort?.(new Error('timeout'));
          } catch {}
          reject(new Error('timeout'));
        }, timeout);
        req._tid = tid;
      });
      const res = await Promise.race([fetch(url, req), timeoutPromise]);
      if (!res.ok && isRetryableStatus(res.status))
        throw new Error(String(res.status));
      if (req._tid) clearTimeout(req._tid);
      req.signal?.throwIfAborted?.();
      return res;
    } catch (e) {
      if (req._tid) clearTimeout(req._tid);
      attempt += 1;
      const msg = String(e?.message || e);
      const retryable =
        /timeout|network|fetch|aborted|ECONN|ENOTFOUND|EAI_AGAIN|TLS|429|5\d\d/i.test(
          msg,
        );
      if (!retryable || attempt > retries) throw e;
      const delay =
        base * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 50);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
async function listModelsForProvider(p) {
  try {
    if (p.type === 'openai') {
      const base = (p.baseUrl || 'https://api.openai.com').replace(/\/$/, '');
      const res = await fetchWithRetry(
        `${base}/v1/models`,
        {
          headers: { Authorization: `Bearer ${p.apiKey}` },
        },
        { retries: 2, baseDelayMs: 200, timeoutMs: 10000 },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const ids = (json.data || []).map((m) => m.id);
      return ids.sort();
    }
    if (p.type === 'anthropic') {
      const base = (p.baseUrl || 'https://api.anthropic.com').replace(
        /\/$/,
        '',
      );
      const res = await fetchWithRetry(
        `${base}/v1/models`,
        {
          headers: {
            'x-api-key': p.apiKey,
            'anthropic-version': '2023-06-01',
          },
        },
        { retries: 2, baseDelayMs: 200, timeoutMs: 10000 },
      );
      if (res.ok) {
        const json = await res.json();
        const ids = (json.data || [])
          .map((m) => m.id || m.name)
          .filter(Boolean);
        if (ids.length) return ids.sort();
      }
      return [
        'claude-3-7-sonnet-latest',
        'claude-3-5-sonnet-latest',
        'claude-3-opus-latest',
        'claude-3-haiku-latest',
      ];
    }
    if (p.type === 'openrouter') {
      const base = (p.baseUrl || 'https://openrouter.ai').replace(/\/$/, '');
      const res = await fetchWithRetry(
        `${base}/api/v1/models`,
        {
          headers: {
            Authorization: `Bearer ${p.apiKey}`,
          },
        },
        { retries: 2, baseDelayMs: 200, timeoutMs: 10000 },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const ids = (json.data || []).map((m) => m.id);
      return ids.sort();
    }
    if (p.type === 'ollama') {
      const host = p.host.replace(/\/$/, '');
      const res = await fetchWithRetry(
        `${host}/api/tags`,
        {},
        { retries: 2, baseDelayMs: 200, timeoutMs: 10000 },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const ids = (json.models || []).map((m) => m.name);
      return ids.sort();
    }
  } catch (e) {
    console.warn(`Failed to list models for ${p.name}:`, e);
  }
  return [];
}
async function sendChat(p, model, messages) {
  if (p.type === 'openai') {
    const base = (p.baseUrl || 'https://api.openai.com').replace(/\/$/, '');
    const res = await fetchWithRetry(
      `${base}/v1/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${p.apiKey}`,
        },
        body: JSON.stringify({ model, messages, temperature: 0.2 }),
      },
      { retries: 2, baseDelayMs: 250, timeoutMs: 20000 },
    );
    if (!res.ok) throw new Error(`OpenAI ${res.status}`);
    const json = await res.json();
    return json.choices?.[0]?.message?.content || '';
  }
  if (p.type === 'anthropic') {
    const base = (p.baseUrl || 'https://api.anthropic.com').replace(/\/$/, '');
    const system = messages.find((m) => m.role === 'system')?.content;
    const msgs = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content }));
    const res = await fetchWithRetry(
      `${base}/v1/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': p.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          system,
          messages: msgs,
          max_tokens: 1024,
          temperature: 0.2,
        }),
      },
      { retries: 2, baseDelayMs: 250, timeoutMs: 20000 },
    );
    if (!res.ok) throw new Error(`Anthropic ${res.status}`);
    const json = await res.json();
    const text = json.content?.[0]?.text || '';
    return text;
  }
  if (p.type === 'openrouter') {
    const base = (p.baseUrl || 'https://openrouter.ai').replace(/\/$/, '');
    const res = await fetchWithRetry(
      `${base}/api/v1/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${p.apiKey}`,
        },
        body: JSON.stringify({ model, messages, temperature: 0.2 }),
      },
      { retries: 2, baseDelayMs: 250, timeoutMs: 20000 },
    );
    if (!res.ok) throw new Error(`OpenRouter ${res.status}`);
    const json = await res.json();
    return json.choices?.[0]?.message?.content || '';
  }
  if (p.type === 'ollama') {
    const host = p.host.replace(/\/$/, '');
    const res = await fetchWithRetry(
      `${host}/api/chat`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, stream: false }),
      },
      { retries: 2, baseDelayMs: 250, timeoutMs: 20000 },
    );
    if (!res.ok) throw new Error(`Ollama ${res.status}`);
    const json = await res.json();
    return json.message?.content || json.response || '';
  }
  throw new Error('Unsupported provider');
}
