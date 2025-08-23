import fs from 'fs';
import os from 'os';
import path from 'path';
import readline from 'readline';

type ProviderType = 'openai' | 'anthropic' | 'openrouter' | 'ollama';

interface BaseProviderConfig {
  type: ProviderType;
  name: string; // instance name (e.g., openai, openrouter)
}

interface OpenAIConfig extends BaseProviderConfig {
  type: 'openai';
  apiKey: string;
  baseUrl?: string; // default https://api.openai.com
}

interface AnthropicConfig extends BaseProviderConfig {
  type: 'anthropic';
  apiKey: string;
  baseUrl?: string; // default https://api.anthropic.com
}

interface OpenRouterConfig extends BaseProviderConfig {
  type: 'openrouter';
  apiKey: string;
  baseUrl?: string; // default https://openrouter.ai
}

interface OllamaConfig extends BaseProviderConfig {
  type: 'ollama';
  host: string; // e.g., http://127.0.0.1:11434
}

type ProviderConfig =
  | OpenAIConfig
  | AnthropicConfig
  | OpenRouterConfig
  | OllamaConfig;

type Settings = Record<string, unknown>;

interface PersistedConfig {
  providers: Record<string, ProviderConfig>; // key is provider name
  active?: { provider?: string; model?: string };
  settings?: Settings;
}

function homeBase(): string {
  return process.env.BEEPERMCP_HOME || path.join(os.homedir(), '.BeeperMCP');
}

function configPath(): string {
  return path.join(homeBase(), 'config.json');
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
}

function loadConfig(): PersistedConfig {
  ensureDir(homeBase());
  const p = configPath();
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed.providers) parsed.providers = {};
    return parsed;
  } catch (e: any) {
    if (e && e.code !== 'ENOENT') console.warn('Failed to load config:', e);
    const fresh: PersistedConfig = { providers: {} };
    saveConfig(fresh);
    return fresh;
  }
}

function saveConfig(cfg: PersistedConfig) {
  ensureDir(homeBase());
  const p = configPath();
  const out = JSON.stringify(cfg, null, 2);
  fs.writeFileSync(p, out, { mode: 0o600 });
}

async function prompt(question: string, hide = false): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  if (hide) {
    // Simple mask by turning off echo (best-effort)
    const setRaw = (process.stdin as any).setRawMode;
    if (setRaw) setRaw.call(process.stdin, true);
  }
  const ans = await new Promise<string>((resolve) =>
    rl.question(question, resolve),
  );
  rl.close();
  return ans.trim();
}

async function choose<T extends string>(
  title: string,
  options: T[],
): Promise<T> {
  console.log(title);
  options.forEach((opt, i) => console.log(`  ${i + 1}) ${opt}`));
  while (true) {
    const ans = await prompt('Select number: ');
    const idx = Number(ans) - 1;
    if (!Number.isNaN(idx) && idx >= 0 && idx < options.length)
      return options[idx];
    console.log('Invalid selection.');
  }
}

async function configureProvider(cfg: PersistedConfig) {
  const type = await choose<ProviderType>('Add provider:', [
    'openai',
    'anthropic',
    'openrouter',
    'ollama',
  ]);
  const nameDefault = type;
  const name =
    (await prompt(`Instance name [${nameDefault}]: `)) || nameDefault;
  if (type === 'openai') {
    const apiKey = await prompt('OpenAI API key: ');
    const baseUrl =
      (await prompt('Base URL [https://api.openai.com]: ')) ||
      'https://api.openai.com';
    cfg.providers[name] = { type, name, apiKey, baseUrl } as OpenAIConfig;
  } else if (type === 'anthropic') {
    const apiKey = await prompt('Anthropic API key: ');
    const baseUrl =
      (await prompt('Base URL [https://api.anthropic.com]: ')) ||
      'https://api.anthropic.com';
    cfg.providers[name] = { type, name, apiKey, baseUrl } as AnthropicConfig;
  } else if (type === 'openrouter') {
    const apiKey = await prompt('OpenRouter API key: ');
    const baseUrl =
      (await prompt('Base URL [https://openrouter.ai]: ')) ||
      'https://openrouter.ai';
    cfg.providers[name] = { type, name, apiKey, baseUrl } as OpenRouterConfig;
  } else if (type === 'ollama') {
    const host =
      (await prompt('Ollama host [http://127.0.0.1:11434]: ')) ||
      'http://127.0.0.1:11434';
    cfg.providers[name] = { type, name, host } as OllamaConfig;
  }
  saveConfig(cfg);
  console.log(`Saved provider '${name}'.`);
}

async function listModelsForProvider(p: ProviderConfig): Promise<string[]> {
  try {
    if (p.type === 'openai') {
      const base = (p.baseUrl || 'https://api.openai.com').replace(/\/$/, '');
      const res = await fetch(`${base}/v1/models`, {
        headers: { Authorization: `Bearer ${(p as OpenAIConfig).apiKey}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: any = await res.json();
      const ids: string[] = (json.data || []).map((m: any) => m.id);
      // Prefer chat-capable models (simple heuristic)
      return ids.sort();
    }
    if (p.type === 'anthropic') {
      const base = (p.baseUrl || 'https://api.anthropic.com').replace(
        /\/$/,
        '',
      );
      const res = await fetch(`${base}/v1/models`, {
        headers: {
          'x-api-key': (p as AnthropicConfig).apiKey,
          'anthropic-version': '2023-06-01',
        },
      });
      if (res.ok) {
        const json: any = await res.json();
        const ids: string[] = (json.data || [])
          .map((m: any) => m.id || m.name)
          .filter(Boolean);
        if (ids.length) return ids.sort();
      }
      // Fallback: known models (may be outdated)
      return [
        'claude-3-7-sonnet-latest',
        'claude-3-5-sonnet-latest',
        'claude-3-opus-latest',
        'claude-3-haiku-latest',
      ];
    }
    if (p.type === 'openrouter') {
      const base = (p.baseUrl || 'https://openrouter.ai').replace(/\/$/, '');
      const res = await fetch(`${base}/api/v1/models`, {
        headers: { Authorization: `Bearer ${(p as OpenRouterConfig).apiKey}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: any = await res.json();
      const ids: string[] = (json.data || []).map((m: any) => m.id);
      return ids.sort();
    }
    if (p.type === 'ollama') {
      const host = (p as OllamaConfig).host.replace(/\/$/, '');
      const res = await fetch(`${host}/api/tags`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: any = await res.json();
      const ids: string[] = (json.models || []).map((m: any) => m.name);
      return ids.sort();
    }
  } catch (e) {
    console.warn(`Failed to list models for ${p.name}:`, e);
  }
  return [];
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

async function sendChat(
  p: ProviderConfig,
  model: string,
  messages: ChatMessage[],
): Promise<string> {
  if (p.type === 'openai') {
    const base = (p.baseUrl || 'https://api.openai.com').replace(/\/$/, '');
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${(p as OpenAIConfig).apiKey}`,
      },
      body: JSON.stringify({ model, messages, temperature: 0.2 }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}`);
    const json: any = await res.json();
    return json.choices?.[0]?.message?.content || '';
  }
  if (p.type === 'anthropic') {
    const base = (p.baseUrl || 'https://api.anthropic.com').replace(/\/$/, '');
    // Convert to Anthropic Messages format
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
      },
      body: JSON.stringify({
        model,
        system,
        messages: msgs,
        max_tokens: 1024,
        temperature: 0.2,
      }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}`);
    const json: any = await res.json();
    const text = (json.content?.[0]?.text as string) || '';
    return text;
  }
  if (p.type === 'openrouter') {
    const base = (p.baseUrl || 'https://openrouter.ai').replace(/\/$/, '');
    const res = await fetch(`${base}/api/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${(p as OpenRouterConfig).apiKey}`,
      },
      body: JSON.stringify({ model, messages, temperature: 0.2 }),
    });
    if (!res.ok) throw new Error(`OpenRouter ${res.status}`);
    const json: any = await res.json();
    return json.choices?.[0]?.message?.content || '';
  }
  if (p.type === 'ollama') {
    const host = (p as OllamaConfig).host.replace(/\/$/, '');
    // Convert to Ollama chat format
    const res = await fetch(`${host}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: false }),
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}`);
    const json: any = await res.json();
    return json.message?.content || json.response || '';
  }
  throw new Error('Unsupported provider');
}

function printHelp() {
  console.log(`Commands:
  /help                 Show this help
  /providers            List configured providers
  /add                  Add a new provider
  /models               List models for active provider
  /switch               Switch active provider and model
  /version              Show current version
  /update               Check for update and apply if available
  /set key value        Set a config value (e.g., settings.*)
  /config               Show current config (redacts secrets)
  /quit                 Exit
`);
}

function redact(p: ProviderConfig): any {
  const clone = { ...p } as any;
  if ('apiKey' in clone && clone.apiKey) clone.apiKey = '***';
  return clone;
}

async function selectActive(cfg: PersistedConfig) {
  const names = Object.keys(cfg.providers);
  if (!names.length) {
    console.log('No providers configured. Use /add to configure one.');
    return;
  }
  const name = await choose('Select provider:', names as any);
  const prov = cfg.providers[name];
  const models = await listModelsForProvider(prov);
  if (!models.length) {
    console.log('No models found.');
    return;
  }
  const model = await choose('Select model:', models as any);
  cfg.active = { provider: name, model };
  saveConfig(cfg);
  console.log(`Active: ${name} / ${model}`);
}

async function run() {
  ensureDir(homeBase());
  const cfg = loadConfig();
  console.log('BeeperMCP Chat CLI (STDIO)');
  printHelp();

  if (!cfg.active || !cfg.active.provider || !cfg.active.model) {
    if (!Object.keys(cfg.providers).length) {
      await configureProvider(cfg);
    }
    await selectActive(cfg);
  }

  let history: ChatMessage[] = [];
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> ',
  });
  rl.prompt();
  rl.on('line', async (line) => {
    const text = line.trim();
    if (!text) return rl.prompt();
    if (text.startsWith('/')) {
      const [cmd, ...rest] = text.slice(1).split(/\s+/);
      if (cmd === 'help' || cmd === 'h') {
        printHelp();
      } else if (cmd === 'version' || cmd === 'v') {
        const ver =
          process.env.npm_package_version ||
          process.env.BEEPER_MCP_VERSION ||
          'dev';
        console.log(`BeeperMCP ${ver}`);
      } else if (cmd === 'update') {
        try {
          const { maybeAutoUpdate } = await import('../update/autoUpdate.js');
          const res: any = await maybeAutoUpdate({ force: true });
          if (res?.replaced) {
            console.log('Updated successfully. Please restart the CLI.');
          } else {
            console.log(res?.reason || 'Already up to date.');
          }
        } catch (e: any) {
          console.error('Update failed:', e?.message || e);
        }
      } else if (cmd === 'providers') {
        for (const [name, prov] of Object.entries(cfg.providers)) {
          console.log(`- ${name}:`, redact(prov));
        }
      } else if (cmd === 'add') {
        await configureProvider(cfg);
      } else if (cmd === 'models') {
        const activeProv =
          cfg.active?.provider && cfg.providers[cfg.active.provider];
        if (!activeProv) console.log('No active provider');
        else {
          const models = await listModelsForProvider(activeProv);
          console.log(models.join('\n'));
        }
      } else if (cmd === 'switch') {
        await selectActive(cfg);
      } else if (cmd === 'set') {
        const key = rest.shift();
        const value = rest.join(' ');
        if (!key) console.log('Usage: /set key value');
        else {
          // simple dot path setter under cfg.settings
          cfg.settings = cfg.settings || {};
          (cfg.settings as any)[key] = value;
          saveConfig(cfg);
          console.log(`Set ${key}=${value}`);
        }
      } else if (cmd === 'config') {
        const clone = {
          ...cfg,
          providers: Object.fromEntries(
            Object.entries(cfg.providers).map(([k, v]) => [k, redact(v)]),
          ),
        };
        console.log(JSON.stringify(clone, null, 2));
      } else if (cmd === 'quit' || cmd === 'exit' || cmd === 'q') {
        rl.close();
        return;
      } else {
        console.log('Unknown command. /help for help.');
      }
      rl.prompt();
      return;
    }
    // Chat
    try {
      const activeProv =
        cfg.active?.provider && cfg.providers[cfg.active.provider];
      const model = cfg.active?.model;
      if (!activeProv || !model) {
        console.log('No active provider/model. Use /switch.');
        rl.prompt();
        return;
      }
      history.push({ role: 'user', content: text });
      const reply = await sendChat(activeProv, model, history);
      history.push({ role: 'assistant', content: reply });
      console.log(reply);
    } catch (e: any) {
      console.error('Error:', e?.message || e);
    }
    rl.prompt();
  });
  rl.on('close', () => {
    console.log('Goodbye!');
    process.exit(0);
  });
}

run();
