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
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
const fs_1 = __importDefault(require('fs'));
const os_1 = __importDefault(require('os'));
const path_1 = __importDefault(require('path'));
const readline_1 = __importDefault(require('readline'));
const helpers_js_1 = require('./helpers.js');
const serverCtl_js_1 = require('./serverCtl.js');
const index_js_1 = require('./providers/index.js');
function homeBase() {
  return (
    process.env.BEEPERMCP_HOME ||
    path_1.default.join(os_1.default.homedir(), '.BeeperMCP')
  );
}
function configPath() {
  return path_1.default.join(homeBase(), 'config.json');
}
function ensureDir(dir) {
  if (!fs_1.default.existsSync(dir))
    fs_1.default.mkdirSync(dir, { recursive: true, mode: 0o700 });
}
function loadConfig() {
  ensureDir(homeBase());
  const p = configPath();
  try {
    const raw = fs_1.default.readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed.providers) parsed.providers = {};
    return parsed;
  } catch (e) {
    if (e && e.code !== 'ENOENT') console.warn('Failed to load config:', e);
    const fresh = { providers: {} };
    saveConfig(fresh);
    return fresh;
  }
}
function saveConfig(cfg) {
  ensureDir(homeBase());
  const p = configPath();
  const out = JSON.stringify(cfg, null, 2);
  fs_1.default.writeFileSync(p, out, { mode: 0o600 });
}
async function prompt(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}
async function choose(rl, title, options) {
  console.log(title);
  options.forEach((opt, i) => console.log(`  ${i + 1}) ${opt}`));
  while (true) {
    const ans = await prompt(rl, 'Select number: ');
    const idx = Number(ans) - 1;
    if (!Number.isNaN(idx) && idx >= 0 && idx < options.length)
      return options[idx];
    console.log('Invalid selection.');
  }
}
async function configureProvider(rl, cfg) {
  const type = await choose(rl, 'Add provider:', [
    'openai',
    'anthropic',
    'openrouter',
    'ollama',
  ]);
  const nameDefault = type;
  const name =
    (await prompt(rl, `Instance name [${nameDefault}]: `)) || nameDefault;
  if (type === 'openai') {
    const apiKey = await prompt(rl, 'OpenAI API key: ');
    const baseUrl =
      (await prompt(rl, 'Base URL [https://api.openai.com]: ')) ||
      'https://api.openai.com';
    cfg.providers[name] = { type, name, apiKey, baseUrl };
  } else if (type === 'anthropic') {
    const apiKey = await prompt(rl, 'Anthropic API key: ');
    const baseUrl =
      (await prompt(rl, 'Base URL [https://api.anthropic.com]: ')) ||
      'https://api.anthropic.com';
    cfg.providers[name] = { type, name, apiKey, baseUrl };
  } else if (type === 'openrouter') {
    const apiKey = await prompt(rl, 'OpenRouter API key: ');
    const baseUrl =
      (await prompt(rl, 'Base URL [https://openrouter.ai]: ')) ||
      'https://openrouter.ai';
    cfg.providers[name] = { type, name, apiKey, baseUrl };
  } else if (type === 'ollama') {
    const host =
      (await prompt(rl, 'Ollama host [http://127.0.0.1:11434]: ')) ||
      'http://127.0.0.1:11434';
    cfg.providers[name] = { type, name, host };
  }
  saveConfig(cfg);
  console.log(`Saved provider '${name}'.`);
}
// listModelsForProvider imported from providers
// ChatMessage imported from helpers
// providerSendChat imported from providers
function printHelp() {
  console.log(`Commands:
  /help                 Show this help ℹ️
  /providers            List configured providers 🧩
  /add                  Add a new provider ➕
  /models               List models for active provider 🧠
  /switch               Switch active provider/model 🔀
  /stream [on|off]      Toggle streaming responses ⏬ (default: on)
  /ml                   Toggle multi-line input (end with '///') ✍️
  /copy [on|off]        Auto-copy last reply to clipboard 📋 (default: off)
  /clear                Clear chat history 🧹
  /version              Show current version 🏷️
  /update               Check for update and apply ⬆️
  /digest [hours]       Generate daily digest 🗞️ (default 24h)
  /qa <question>        Ask a question over history 🔎
  /reply                Draft 3 reply variants ✍️
  /triage               Find rooms needing reply 🧭
  /inbox                Open inbox of pending replies 📥
  /open <n>             Open inbox item by number 🔢
  /server start|stop|status [http|stdio] [port] 🛰️
  /set key value        Set a config value (e.g., settings.*) 🛠️
  /config               Show current config (redacts secrets) ⚙️
  /quit                 Exit 🚪
`);
}
function redact(p) {
  const clone = { ...p };
  if ('apiKey' in clone && clone.apiKey) clone.apiKey = '***';
  return clone;
}
async function selectActive(rl, cfg) {
  const names = Object.keys(cfg.providers);
  if (!names.length) {
    console.log('No providers configured. Use /add to configure one.');
    return;
  }
  const name = await choose(rl, 'Select provider:', names);
  const prov = cfg.providers[name];
  const models = await (0, index_js_1.listModelsForProvider)(prov);
  if (!models.length) {
    console.log('No models found.');
    return;
  }
  const model = await choose(rl, 'Select model:', models);
  cfg.active = { provider: name, model };
  saveConfig(cfg);
  console.log(`Active: ${name} / ${model}`);
}
async function run() {
  ensureDir(homeBase());
  const cfg = loadConfig();
  console.log('BeeperMCP Chat CLI (STDIO)');
  printHelp();
  const rl = readline_1.default.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> ',
  });
  if (!cfg.active || !cfg.active.provider || !cfg.active.model) {
    if (!Object.keys(cfg.providers).length) {
      await configureProvider(rl, cfg);
    }
    await selectActive(rl, cfg);
  }
  let history = [];
  let streamEnabled = true;
  let mlEnabled = false;
  let autoCopy = false;
  let mlBuffer = [];
  const histMaxMessages = Number(cfg.settings?.historyMaxMessages ?? 20);
  const histMaxChars = Number(cfg.settings?.historyMaxChars ?? 16000);
  rl.prompt();
  rl.on('line', async (line) => {
    // Multi-line capture
    if (mlEnabled && line.trim() !== '///' && !line.trim().startsWith('/')) {
      mlBuffer.push(line);
      rl.setPrompt('| ');
      rl.prompt();
      return;
    }
    const text =
      mlEnabled && line.trim() === '///' ? mlBuffer.join('\n') : line.trim();
    if (mlEnabled && line.trim() === '///') {
      mlBuffer = [];
    }
    if (!text) return rl.prompt();
    if (text.startsWith('/')) {
      const [cmd, ...rest] = text.slice(1).split(/\s+/);
      if (cmd === 'help' || cmd === 'h') {
        printHelp();
      } else if (cmd === 'stream') {
        const v = (rest[0] || '').toLowerCase();
        if (v === 'on') streamEnabled = true;
        else if (v === 'off') streamEnabled = false;
        else streamEnabled = !streamEnabled;
        console.log(`Streaming: ${streamEnabled ? 'on' : 'off'}`);
      } else if (cmd === 'ml') {
        mlEnabled = !mlEnabled;
        mlBuffer = [];
        console.log(
          `Multi-line: ${mlEnabled ? "on (end input with '///')" : 'off'}`,
        );
      } else if (cmd === 'copy') {
        const v = (rest[0] || '').toLowerCase();
        if (v === 'on') autoCopy = true;
        else if (v === 'off') autoCopy = false;
        else autoCopy = !autoCopy;
        console.log(`Auto copy: ${autoCopy ? 'on' : 'off'}`);
      } else if (cmd === 'clear') {
        history = [];
        console.log('History cleared.');
      } else if (cmd === 'version' || cmd === 'v') {
        const ver =
          process.env.npm_package_version ||
          process.env.BEEPER_MCP_VERSION ||
          'dev';
        console.log(`BeeperMCP ${ver}`);
      } else if (cmd === 'update') {
        try {
          const { maybeAutoUpdate } = await Promise.resolve().then(() =>
            __importStar(require('../update/autoUpdate.js')),
          );
          const res = await maybeAutoUpdate({ force: true });
          if (res?.replaced) {
            console.log('Updated successfully. Please restart the CLI.');
          } else {
            console.log(res?.reason || 'Already up to date.');
          }
        } catch (e) {
          console.error('Update failed:', e?.message || e);
        }
      } else if (cmd === 'providers') {
        for (const [name, prov] of Object.entries(cfg.providers)) {
          console.log(`- ${name}:`, redact(prov));
        }
      } else if (cmd === 'learn_tone') {
        try {
          const aliasesRaw =
            cfg.settings?.userAliases ||
            (await prompt(rl, 'Your Matrix handle(s) (comma-separated): '));
          const aliases = aliasesRaw
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
          const days = Number(
            (await prompt(rl, 'Lookback days [60]: ')) || '60',
          );
          const { learnPersonalTone } = await Promise.resolve().then(() =>
            __importStar(require('../style/engine.js')),
          );
          const map = learnPersonalTone(aliases, { sinceDays: days });
          const count = Object.keys(map).length;
          console.log(`Learned personal tone for ${count} contacts.`);
        } catch (e) {
          console.error('Learn tone failed:', e?.message || e);
        }
      } else if (cmd === 'add') {
        await configureProvider(rl, cfg);
      } else if (cmd === 'models') {
        const activeProv =
          cfg.active?.provider && cfg.providers[cfg.active.provider];
        if (!activeProv) console.log('No active provider');
        else {
          const models = await (0, index_js_1.listModelsForProvider)(
            activeProv,
          );
          console.log(models.join('\n'));
        }
      } else if (cmd === 'switch') {
        await selectActive(rl, cfg);
      } else if (cmd === 'server') {
        const sub = (rest.shift() || '').toLowerCase();
        if (sub === 'status') {
          const st = await (0, serverCtl_js_1.serverStatus)();
          console.log(
            st.running
              ? `Server running (pid=${st.pid}, mode=${st.mode})`
              : 'Server not running',
          );
        } else if (sub === 'start') {
          const mode = rest.shift() || 'stdio';
          const port = Number(rest[0] || '') || undefined;
          const st = await (0, serverCtl_js_1.serverStart)(mode, port);
          console.log(`Server started (pid=${st.pid}, mode=${st.mode})`);
        } else if (sub === 'stop') {
          await (0, serverCtl_js_1.serverStop)();
          console.log('Server stopped');
        } else {
          console.log('Usage: /server start|stop|status [http|stdio] [port]');
        }
      } else if (cmd === 'set') {
        const key = rest.shift();
        const value = rest.join(' ');
        if (!key) console.log('Usage: /set key value');
        else {
          // simple dot path setter under cfg.settings
          cfg.settings = cfg.settings || {};
          cfg.settings[key] = value;
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
            const { runDigest } = await Promise.resolve().then(() =>
              __importStar(require('./commands/digest.js')),
            );
            const res = await runDigest({ hours: h }, (p) =>
              (0, index_js_1.sendChat)(activeProv, cfg.active.model, [
                { role: 'user', content: p },
              ]),
            );
            console.log(`Saved digest to ${res.file}`);
            console.log(res.preview);
          }
        } catch (e) {
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
              const { askQA } = await Promise.resolve().then(() =>
                __importStar(require('./commands/qa.js')),
              );
              const res = await askQA(question, {}, (p) =>
                (0, index_js_1.sendChat)(activeProv, cfg.active.model, [
                  { role: 'user', content: p },
                ]),
              );
              console.log(res.answer);
            }
          }
        } catch (e) {
          console.error('QA failed:', e?.message || e);
        }
      } else if (cmd === 'reply') {
        try {
          console.log('Paste the message to reply to, then press Enter:');
          const msg = await prompt(rl, '');
          const activeProv =
            cfg.active?.provider && cfg.providers[cfg.active.provider];
          if (!activeProv) console.log('No active provider. Use /switch.');
          else {
            const { draftReplies } = await Promise.resolve().then(() =>
              __importStar(require('./commands/reply.js')),
            );
            let out = await draftReplies('', msg, (p) =>
              (0, index_js_1.sendChat)(activeProv, cfg.active.model, [
                { role: 'user', content: p },
              ]),
            );
            console.log(out);
            if (activeProv.type === 'openrouter') {
              const fb = await prompt(
                rl,
                'Refine drafts? Enter instructions (or press Enter to skip): ',
              );
              if (fb) {
                const Provider = (
                  await Promise.resolve().then(() =>
                    __importStar(require('../providers/openrouter.js')),
                  )
                ).default;
                const prov = new Provider(activeProv.apiKey);
                const refined = await prov.iterateResponse(out, fb);
                const text = refined.content || '';
                console.log('\nRefined drafts:\n' + text);
              }
            }
          }
        } catch (e) {
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
              cfg.settings?.userAliases ||
              (await prompt(
                rl,
                'Your Matrix handle(s) (comma-separated, e.g., @you:server): ',
              ));
            const aliases = aliasesRaw
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
            cfg.settings = cfg.settings || {};
            cfg.settings.userAliases = aliases.join(',');
            const tone =
              cfg.settings.tone ||
              (await prompt(
                rl,
                'Preferred tone [concise/friendly/formal] (default: concise): ',
              )) ||
              'concise';
            const language =
              cfg.settings.language ||
              (await prompt(
                rl,
                'Preferred language (e.g., en, fi) [leave empty for auto]: ',
              ));
            cfg.settings.tone = tone;
            cfg.settings.language = language;
            saveConfig(cfg);
            const { findActionables, generateDrafts } =
              await Promise.resolve().then(() =>
                __importStar(require('./commands/triage.js')),
              );
            const candidates = findActionables(
              {
                userAliases: aliases,
                tone: tone,
                language: language,
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
                    rl,
                    'Your intention? [inform/ask-time/approve/decline/provide-info/custom]: ',
                  )) || 'inform';
                const extra = await prompt(
                  rl,
                  'Any extra instructions (constraints, details)? ',
                );
                const drafts = await generateDrafts(
                  c,
                  {
                    userAliases: aliases,
                    tone: tone,
                    language: language,
                  },
                  intention,
                  extra,
                  (p) =>
                    (0, index_js_1.sendChat)(activeProv, cfg.active.model, [
                      { role: 'user', content: p },
                    ]),
                );
                console.log('\nDrafts:\n' + drafts);
                const more = await prompt(
                  rl,
                  'Revise with extra instruction (leave empty to continue): ',
                );
                if (more) {
                  const revised = await generateDrafts(
                    c,
                    {
                      userAliases: aliases,
                      tone: tone,
                      language: language,
                    },
                    intention,
                    more,
                    (p) =>
                      (0, index_js_1.sendChat)(activeProv, cfg.active.model, [
                        { role: 'user', content: p },
                      ]),
                  );
                  console.log('\nRevised drafts:\n' + revised);
                }
              }
            }
          }
        } catch (e) {
          console.error('Triage failed:', e?.message || e);
        }
      } else if (cmd === 'inbox') {
        try {
          const activeProv =
            cfg.active?.provider && cfg.providers[cfg.active.provider];
          if (!activeProv)
            return console.log('No active provider. Use /switch.');
          const { refreshInbox, renderInbox, openItem, saveInbox, loadInbox } =
            await Promise.resolve().then(() =>
              __importStar(require('./commands/inbox.js')),
            );
          const aliasesRaw =
            cfg.settings?.userAliases ||
            (await prompt(rl, 'Your Matrix handle(s) (comma-separated): '));
          const aliases = aliasesRaw
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
          cfg.settings = cfg.settings || {};
          cfg.settings.userAliases = aliases.join(',');
          const tone =
            cfg.settings.tone ||
            (await prompt(
              rl,
              'Preferred tone [concise/friendly/formal] (default: friendly): ',
            )) ||
            'friendly';
          const language =
            cfg.settings.language ||
            (await prompt(
              rl,
              'Preferred language (e.g., en, fi) [empty=auto]: ',
            ));
          cfg.settings.tone = tone;
          cfg.settings.language = language;
          saveConfig(cfg);
          const prefs = {
            userAliases: aliases,
            tone: tone,
            language: language,
          };
          await refreshInbox(prefs, 24);
          let items = loadInbox().filter((i) => i.status === 'open');
          if (!items.length) {
            console.log('Inbox is empty.');
          } else {
            let cursor = 0;
            const rl2 = readline_1.default.createInterface({
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
                const res = await openItem(item, prefs, (p) =>
                  (0, index_js_1.sendChat)(activeProv, cfg.active.model, [
                    { role: 'user', content: p },
                  ]),
                );
                if (res === 'sent' || res === 'dismissed') {
                  const all = loadInbox();
                  const m = all.find((x) => x.id === item.id);
                  if (m) m.status = res === 'sent' ? 'sent' : 'dismissed';
                  saveInbox(all);
                }
                items = loadInbox().filter((i) => i.status === 'open');
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
            await new Promise((resolve) => rl2.on('close', () => resolve()));
          }
        } catch (e) {
          console.error('Inbox failed:', e?.message || e);
        }
      } else if (cmd === 'open') {
        try {
          const n = Number(rest[0] || '');
          if (!n) return console.log('Usage: /open <n>');
          const { loadInbox, openItem, saveInbox } =
            await Promise.resolve().then(() =>
              __importStar(require('./commands/inbox.js')),
            );
          const items = loadInbox().filter((i) => i.status === 'open');
          if (n < 1 || n > items.length) return console.log('Invalid index');
          const item = items[n - 1];
          const aliasesRaw =
            cfg.settings?.userAliases ||
            (await prompt(rl, 'Your Matrix handle(s) (comma-separated): '));
          const aliases = aliasesRaw
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
          const tone = cfg.settings.tone || 'friendly';
          const language = cfg.settings.language || '';
          const prefs = {
            userAliases: aliases,
            tone: tone,
            language: language,
          };
          const activeProv =
            cfg.active?.provider && cfg.providers[cfg.active.provider];
          if (!activeProv)
            return console.log('No active provider. Use /switch.');
          const res = await openItem(item, prefs, (p) =>
            (0, index_js_1.sendChat)(activeProv, cfg.active.model, [
              { role: 'user', content: p },
            ]),
          );
          if (res === 'sent' || res === 'dismissed') {
            const all = loadInbox();
            const m = all.find((x) => x.id === item.id);
            if (m) m.status = res === 'sent' ? 'sent' : 'dismissed';
            saveInbox(all);
          }
        } catch (e) {
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
      let reply = '';
      const canStream =
        streamEnabled && (0, helpers_js_1.supportsStreaming)(activeProv);
      if (canStream) {
        // live streaming
        try {
          for await (const tok of (0, helpers_js_1.streamChat)(
            activeProv,
            model,
            (0, helpers_js_1.truncateHistory)(history, {
              maxMessages: histMaxMessages,
              maxChars: histMaxChars,
            }),
          )) {
            reply += tok;
            process.stdout.write(tok);
          }
          process.stdout.write('\n');
        } catch (e) {
          console.error('--- Stream error:', e?.message || e);
          // Fallback to non-stream request
          reply = await (0, index_js_1.sendChat)(
            activeProv,
            model,
            (0, helpers_js_1.truncateHistory)(history, {
              maxMessages: histMaxMessages,
              maxChars: histMaxChars,
            }),
          );
          console.log(reply);
        }
      } else {
        reply = await (0, index_js_1.sendChat)(
          activeProv,
          model,
          (0, helpers_js_1.truncateHistory)(history, {
            maxMessages: histMaxMessages,
            maxChars: histMaxChars,
          }),
        );
        console.log(reply);
      }
      history.push({ role: 'assistant', content: reply });
      history = (0, helpers_js_1.truncateHistory)(history, {
        maxMessages: histMaxMessages,
        maxChars: histMaxChars,
      });
      if (autoCopy) {
        const ok = await (0, helpers_js_1.copyToClipboard)(reply);
        if (!ok) console.log('(Clipboard copy unavailable on this system)');
      }
    } catch (e) {
      console.error('--- Error:', e?.message || e);
    }
    rl.prompt();
  });
  rl.on('close', () => {
    console.log('Goodbye!');
    process.exit(0);
  });
}
run();
