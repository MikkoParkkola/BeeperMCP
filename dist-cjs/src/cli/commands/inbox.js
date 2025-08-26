'use strict';
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.loadInbox = loadInbox;
exports.saveInbox = saveInbox;
exports.refreshInbox = refreshInbox;
exports.renderInbox = renderInbox;
exports.openItem = openItem;
const fs_1 = __importDefault(require('fs'));
const os_1 = __importDefault(require('os'));
const path_1 = __importDefault(require('path'));
const readline_1 = __importDefault(require('readline'));
const sanitize_js_1 = require('../../security/sanitize.js');
const guardrails_js_1 = require('../../security/guardrails.js');
const rateLimit_js_1 = require('../../security/rateLimit.js');
const client_js_1 = require('../../matrix/client.js');
const triage_js_1 = require('./triage.js');
function homeBase() {
  return (
    process.env.BEEPERMCP_HOME ||
    path_1.default.join(os_1.default.homedir(), '.BeeperMCP')
  );
}
function inboxPath() {
  return path_1.default.join(homeBase(), 'inbox.json');
}
function loadInbox() {
  try {
    const raw = fs_1.default.readFileSync(inboxPath(), 'utf8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}
function saveInbox(items) {
  fs_1.default.mkdirSync(homeBase(), { recursive: true });
  fs_1.default.writeFileSync(inboxPath(), JSON.stringify(items, null, 2), {
    mode: 0o600,
  });
}
async function refreshInbox(prefs, hours = 24) {
  const existing = loadInbox();
  const index = new Map(existing.map((i) => [i.id, i]));
  const found = (0, triage_js_1.findActionables)(prefs, { hours });
  for (const c of found) {
    const id = `${c.roomId}:${c.ts}`;
    if (index.has(id)) continue;
    index.set(id, {
      id,
      roomId: c.roomId,
      ts: c.ts,
      sender: c.sender,
      preview: c.text.slice(0, 120),
      status: 'open',
    });
  }
  // Drop expired snoozes
  const now = Date.now();
  const merged = [...index.values()].filter(
    (i) => !i.snoozeUntil || i.snoozeUntil > now,
  );
  saveInbox(merged);
  return merged;
}
function renderInbox(items, cursor = 0) {
  const rows = items
    .filter((i) => i.status === 'open')
    .slice(0, 200)
    .map((i, idx) => {
      const mark = idx === cursor ? '>' : ' ';
      const when = new Date(i.ts).toLocaleString();
      return `${mark} ${idx + 1}. [${i.roomId}] ${when} ${i.sender}: ${i.preview}`;
    });
  if (!rows.length) rows.push('No open conversations.');
  return rows.join('\n');
}
async function openItem(item, prefs, askLLM, editor, sender) {
  const _brief = await (0, triage_js_1.ensureRoomBrief)(item.roomId, askLLM);
  void _brief;
  const ctx = {
    prompt: (q) =>
      new Promise((resolve) => {
        const rl = readline_1.default.createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        rl.question(q, (ans) => {
          rl.close();
          resolve(ans.trim());
        });
      }),
  };
  const intention =
    (await ctx.prompt(
      'Your intention? [inform/ask-time/approve/decline/provide-info/custom]: ',
    )) || 'inform';
  const extra = await ctx.prompt('Any extra instructions? ');
  const drafts = await (0, triage_js_1.generateDrafts)(
    {
      roomId: item.roomId,
      sender: item.sender,
      ts: item.ts,
      text: item.preview,
      context: [item.preview],
    },
    prefs,
    intention,
    extra,
    askLLM,
  );
  console.log(`\nRoom: ${item.roomId}\n— Drafts —\n${drafts}\n`);
  const action =
    (await ctx.prompt(
      'Action [a=accept ✅, e=edit ✍️, r=revise ♻️, x=reject ❌, s=snooze 😴, v=view 👁️]: ',
    )) || 'a';
  if (action === 'v') {
    console.log(`\n(Use /brief ${item.roomId} for full Watchtower)\n`);
    return 'viewed';
  }
  if (action === 'x') return 'dismissed';
  if (action === 's') {
    const opt =
      (await ctx.prompt('Snooze for [2h/tonight/tomorrow] 😴: ')) || '2h';
    return `snooze:${opt}`;
  }
  let finalText = drafts;
  if (action === 'r') {
    const more = await ctx.prompt('Revise with: ');
    finalText = await (0, triage_js_1.generateDrafts)(
      {
        roomId: item.roomId,
        sender: item.sender,
        ts: item.ts,
        text: item.preview,
        context: [item.preview],
      },
      prefs,
      intention,
      more,
      askLLM,
    );
    console.log(`\n— Revised —\n${finalText}\n`);
  }
  if (action === 'e') {
    const edit = editor || (async (init) => init);
    finalText = await edit(finalText);
  }
  // Choose a single reply line if the model returned two; pick the first non-empty paragraph
  const choice =
    finalText
      .split(/\n+/)
      .map((s) => s.trim())
      .filter((s) => s && !/^\d+\)/.test(s))[0] || finalText.trim();
  // Safety & approval
  try {
    (0, rateLimit_js_1.rateLimiter)('cli_send', 10);
  } catch {
    console.error('Rate limited. Try again later.');
    return 'rate_limited';
  }
  const safe = (0, sanitize_js_1.sanitizeText)(choice);
  const gr = (0, guardrails_js_1.checkGuardrails)(safe, prefs.userAliases[0]);
  if (!gr.ok) {
    console.error(`Blocked by guardrails: ${gr.reason} 🛡️`);
    return 'blocked';
  }
  const confirm = (await ctx.prompt('Send? [y/N] 🚀: ')).toLowerCase();
  if (confirm !== 'y') return 'cancelled';
  const send =
    sender ||
    (async (roomId, text) => {
      try {
        await (0, client_js_1.sendMessage)(roomId, text);
      } catch (e) {
        console.error('Send failed:', e?.message || e);
        throw e;
      }
    });
  await send(item.roomId, safe);
  return 'sent';
}
