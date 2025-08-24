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
  /help                 Show this help ℹ️
  /providers            List configured providers 🧩
  /add                  Add a new provider ➕
  /models               List models for active provider 🧠
  /switch               Switch active provider/model 🔀
  /version              Show current version 🏷️
  /update               Check for update and apply ⬆️
  /digest [hours]       Generate daily digest 🗞️ (default 24h)
  /qa <question>        Ask a question over history 🔎
  /reply                Draft 3 reply variants ✍️
  /triage               Find rooms needing reply 🧭
  /inbox                Open inbox of pending replies 📥
  /open <n>             Open inbox item by number 🔢
  /set key value        Set a config value (e.g., settings.*) 🛠️
  /config               Show current config (redacts secrets) ⚙️
  /quit                 Exit 🚪
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
      } else if (cmd === 'learn_tone') {
        try {
          const aliasesRaw =
            (cfg.settings?.userAliases as string) ||
            (await prompt('Your Matrix handle(s) (comma-separated): '));
          const aliases = aliasesRaw
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
          const days = Number((await prompt('Lookback days [60]: ')) || '60');
          const { learnPersonalTone } = await import('../style/engine.js');
          const map = learnPersonalTone(aliases, { sinceDays: days });
          const count = Object.keys(map).length;
          console.log(`Learned personal tone for ${count} contacts.`);
        } catch (e: any) {
          console.error('Learn tone failed:', e?.message || e);
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
      } else if (cmd === 'digest') {
        try {
          const h = Number(rest[0] || '24');
          const activeProv =
            cfg.active?.provider && cfg.providers[cfg.active.provider];
          if (!activeProv) console.log('No active provider. Use /switch.');
          else {
            const { runDigest } = await import('./commands/digest.js');
            const res = await runDigest({ hours: h }, (p: string) =>
              sendChat(activeProv, cfg.active!.model!, [
                { role: 'user', content: p },
              ]),
            );
            console.log(`Saved digest to ${res.file}`);
            console.log(res.preview);
          }
        } catch (e: any) {
          console.error('Digest failed:', e?.message || e);
        }
      } else if (cmd === 'qa') {
        try {
          const question = rest.join(' ');
          if (!question) {
            console.log('Usage: /qa <question>');
          } else {
            const activeProv =
              cfg.active?.provider && cfg.providers[cfg.active.provider];
            if (!activeProv) console.log('No active provider. Use /switch.');
            else {
              const { askQA } = await import('./commands/qa.js');
              const res = await askQA(question, {}, (p: string) =>
                sendChat(activeProv, cfg.active!.model!, [
                  { role: 'user', content: p },
                ]),
              );
              console.log(res.answer);
            }
          }
        } catch (e: any) {
          console.error('QA failed:', e?.message || e);
        }
      } else if (cmd === 'reply') {
        try {
          console.log('Paste the message to reply to, then press Enter:');
          const msg = await new Promise<string>((resolve) =>
            rl.question('', resolve),
          );
          const activeProv =
            cfg.active?.provider && cfg.providers[cfg.active.provider];
          if (!activeProv) console.log('No active provider. Use /switch.');
          else {
            const { draftReplies } = await import('./commands/reply.js');
            let out = await draftReplies('', msg, (p: string) =>
              sendChat(activeProv, cfg.active!.model!, [
                { role: 'user', content: p },
              ]),
            );
            console.log(out);
            if (activeProv.type === 'openrouter') {
              const fb = await prompt(
                'Refine drafts? Enter instructions (or press Enter to skip): ',
              );
              if (fb) {
                const Provider = (await import('../providers/openrouter.js'))
                  .default;
                const prov = new Provider((activeProv as any).apiKey);
                const refined = await prov.iterateResponse(out, fb);
                const text = (refined as any).content || '';
                console.log('\nRefined drafts:\n' + text);
              }
            }
          }
        } catch (e: any) {
          console.error('Reply failed:', e?.message || e);
        }
      } else if (cmd === 'triage') {
        try {
          const activeProv =
            cfg.active?.provider && cfg.providers[cfg.active.provider];
          if (!activeProv) {
            console.log('No active provider. Use /switch.');
          } else {
            // Ensure user aliases and preferences
            const aliasesRaw =
              (cfg.settings?.userAliases as string) ||
              (await prompt(
                'Your Matrix handle(s) (comma-separated, e.g., @you:server): ',
              ));
            const aliases = aliasesRaw
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
            cfg.settings = cfg.settings || {};
            (cfg.settings as any).userAliases = aliases.join(',');
            const tone =
              ((cfg.settings as any).tone as string) ||
              (await prompt(
                'Preferred tone [concise/friendly/formal] (default: concise): ',
              )) ||
              'concise';
            const language =
              (cfg.settings as any).language ||
              (await prompt(
                'Preferred language (e.g., en, fi) [leave empty for auto]: ',
              ));
            (cfg.settings as any).tone = tone;
            (cfg.settings as any).language = language;
            saveConfig(cfg);

            const { findActionables, generateDrafts } = await import(
              './commands/triage.js'
            );
            const candidates = findActionables(
              {
                userAliases: aliases,
                tone: tone as any,
                language: language as any,
              },
              { hours: 24 },
            );
            if (!candidates.length) {
              console.log('No rooms need your reply right now.');
            } else {
              for (const c of candidates) {
                console.log(
                  `\nRoom: ${c.roomId}\nFrom: ${c.sender}\nAt: ${c.ts}\nMessage: ${c.text}\n---\nContext:\n${c.context.join('\n')}`,
                );
                // Clarify intention
                const intention =
                  (await prompt(
                    'Your intention? [inform/ask-time/approve/decline/provide-info/custom]: ',
                  )) || 'inform';
                const extra = await prompt(
                  'Any extra instructions (constraints, details)? ',
                );
                const drafts = await generateDrafts(
                  c,
                  {
                    userAliases: aliases,
                    tone: tone as any,
                    language: language as any,
                  },
                  intention,
                  extra,
                  (p: string) =>
                    sendChat(activeProv, cfg.active!.model!, [
                      { role: 'user', content: p },
                    ]),
                );
                console.log('\nDrafts:\n' + drafts);
                const more = await prompt(
                  'Revise with extra instruction (leave empty to continue): ',
                );
                if (more) {
                  const revised = await generateDrafts(
                    c,
                    {
                      userAliases: aliases,
                      tone: tone as any,
                      language: language as any,
                    },
                    intention,
                    more,
                    (p: string) =>
                      sendChat(activeProv, cfg.active!.model!, [
                        { role: 'user', content: p },
                      ]),
                  );
                  console.log('\nRevised drafts:\n' + revised);
                }
              }
            }
          }
        } catch (e: any) {
          console.error('Triage failed:', e?.message || e);
        }
      } else if (cmd === 'inbox') {
        try {
          const activeProv =
            cfg.active?.provider && cfg.providers[cfg.active.provider];
          if (!activeProv)
            return console.log('No active provider. Use /switch.');
          const { refreshInbox, renderInbox, openItem, saveInbox, loadInbox } =
            await import('./commands/inbox.js');
          const aliasesRaw =
            (cfg.settings?.userAliases as string) ||
            (await prompt('Your Matrix handle(s) (comma-separated): '));
          const aliases = aliasesRaw
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
          cfg.settings = cfg.settings || {};
          (cfg.settings as any).userAliases = aliases.join(',');
          const tone =
            ((cfg.settings as any).tone as string) ||
            (await prompt(
              'Preferred tone [concise/friendly/formal] (default: friendly): ',
            )) ||
            'friendly';
          const language =
            (cfg.settings as any).language ||
            (await prompt('Preferred language (e.g., en, fi) [empty=auto]: '));
          (cfg.settings as any).tone = tone;
          (cfg.settings as any).language = language;
          saveConfig(cfg);
          const prefs = {
            userAliases: aliases,
            tone: tone as any,
            language: language as any,
          };
          await refreshInbox(prefs, 24);
          let items = loadInbox().filter((i: any) => i.status === 'open');
          if (!items.length) {
            console.log('Inbox is empty.');
          } else {
            let cursor = 0;
            const rl2 = readline.createInterface({
              input: process.stdin,
              output: process.stdout,
            });
            const redraw = () => {
              console.clear?.();
              console.log(renderInbox(items, cursor));
              rl2.setPrompt('Select [Enter], j/k=move, q=quit: ');
              rl2.prompt();
            };
            redraw();
            rl2.on('line', async (ans) => {
              const s = ans.trim();
              if (!s) {
                const item = items[cursor];
                if (!item) return redraw();
                const res = await openItem(item as any, prefs, (p: string) =>
                  sendChat(activeProv, cfg.active!.model!, [
                    { role: 'user', content: p },
                  ]),
                );
                if (res === 'sent' || res === 'dismissed') {
                  const all = loadInbox();
                  const m = all.find((x: any) => x.id === item.id);
                  if (m) m.status = res === 'sent' ? 'sent' : 'dismissed';
                  saveInbox(all);
                }
                items = loadInbox().filter((i: any) => i.status === 'open');
                if (!items.length) {
                  console.log('Inbox is empty.');
                  rl2.close();
                } else {
                  if (cursor >= items.length) cursor = items.length - 1;
                  redraw();
                }
                return;
              }
              if (s === 'q') {
                rl2.close();
                return;
              }
              if (s === 'j') {
                cursor = Math.min(cursor + 1, items.length - 1);
                redraw();
                return;
              }
              if (s === 'k') {
                cursor = Math.max(cursor - 1, 0);
                redraw();
                return;
              }
              const num = Number(s);
              if (!Number.isNaN(num) && num >= 1 && num <= items.length) {
                cursor = num - 1;
                redraw();
                return;
              }
              redraw();
            });
            await new Promise<void>((resolve) =>
              rl2.on('close', () => resolve()),
            );
          }
        } catch (e: any) {
          console.error('Inbox failed:', e?.message || e);
        }
      } else if (cmd === 'open') {
        try {
          const n = Number(rest[0] || '');
          if (!n) return console.log('Usage: /open <n>');
          const { loadInbox, openItem, saveInbox } = await import(
            './commands/inbox.js'
          );
          const items = loadInbox().filter((i: any) => i.status === 'open');
          if (n < 1 || n > items.length) return console.log('Invalid index');
          const item = items[n - 1];
          const aliasesRaw =
            (cfg.settings?.userAliases as string) ||
            (await prompt('Your Matrix handle(s) (comma-separated): '));
          const aliases = aliasesRaw
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
          const tone = ((cfg.settings as any).tone as string) || 'friendly';
          const language = (cfg.settings as any).language || '';
          const prefs = {
            userAliases: aliases,
            tone: tone as any,
            language: language as any,
          };
          const activeProv =
            cfg.active?.provider && cfg.providers[cfg.active.provider];
          if (!activeProv)
            return console.log('No active provider. Use /switch.');
          const res = await openItem(item as any, prefs, (p: string) =>
            sendChat(activeProv, cfg.active!.model!, [
              { role: 'user', content: p },
            ]),
          );
          if (res === 'sent' || res === 'dismissed') {
            const all = loadInbox();
            const m = all.find((x: any) => x.id === item.id);
            if (m) m.status = res === 'sent' ? 'sent' : 'dismissed';
            saveInbox(all);
          }
        } catch (e: any) {
          console.error('Open failed:', e?.message || e);
        }
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
