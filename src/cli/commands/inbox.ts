import fs from 'fs';
import os from 'os';
import path from 'path';
import readline from 'readline';
import { sanitizeText } from '../../security/sanitize.js';
import { checkGuardrails } from '../../security/guardrails.js';
import { rateLimiter } from '../../security/rateLimit.js';
import { sendMessage as matrixSend } from '../../matrix/client.js';
import { findActionables, generateDrafts, ensureRoomBrief, TriagePrefs } from './triage.js';

export interface InboxItem {
  id: string; // `${roomId}:${ts}`
  roomId: string;
  eventId?: string;
  ts: string;
  sender: string;
  preview: string;
  lang?: string;
  status: 'open' | 'snoozed' | 'dismissed' | 'sent';
  snoozeUntil?: number;
}

function homeBase(): string {
  return process.env.BEEPERMCP_HOME || path.join(os.homedir(), '.BeeperMCP');
}

function inboxPath() {
  return path.join(homeBase(), 'inbox.json');
}

export function loadInbox(): InboxItem[] {
  try {
    const raw = fs.readFileSync(inboxPath(), 'utf8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveInbox(items: InboxItem[]) {
  fs.mkdirSync(homeBase(), { recursive: true });
  fs.writeFileSync(inboxPath(), JSON.stringify(items, null, 2), { mode: 0o600 });
}

export async function refreshInbox(prefs: TriagePrefs, hours = 24) {
  const existing = loadInbox();
  const index = new Map(existing.map((i) => [i.id, i]));
  const found = findActionables(prefs, { hours });
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

export function renderInbox(items: InboxItem[], cursor = 0) {
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

export async function openItem(
  item: InboxItem,
  prefs: TriagePrefs,
  askLLM: (prompt: string) => Promise<string>,
  editor?: (initial: string) => Promise<string>,
  sender?: (roomId: string, text: string) => Promise<void>,
) {
  const brief = await ensureRoomBrief(item.roomId, askLLM);
  const ctx = {
    prompt: (q: string) =>
      new Promise<string>((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question(q, (ans) => {
          rl.close();
          resolve(ans.trim());
        });
      }),
  };
  const intention =
    (await ctx.prompt('Your intention? [inform/ask-time/approve/decline/provide-info/custom]: ')) ||
    'inform';
  const extra = await ctx.prompt('Any extra instructions? ');
  const drafts = await generateDrafts(
    {
      roomId: item.roomId,
      sender: item.sender,
      ts: item.ts,
      text: item.preview,
      context: [item.preview],
    } as any,
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
    finalText = await generateDrafts(
      {
        roomId: item.roomId,
        sender: item.sender,
        ts: item.ts,
        text: item.preview,
        context: [item.preview],
      } as any,
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
  const choice = finalText
    .split(/\n+/)
    .map((s) => s.trim())
    .filter((s) => s && !/^\d+\)/.test(s))[0] || finalText.trim();
  // Safety & approval
  try {
    rateLimiter('cli_send', 10);
  } catch (e) {
    console.error('Rate limited. Try again later.');
    return 'rate_limited';
  }
  const safe = sanitizeText(choice);
  const gr = checkGuardrails(safe, prefs.userAliases[0]);
  if (!gr.ok) {
    console.error(`Blocked by guardrails: ${gr.reason} 🛡️`);
    return 'blocked';
  }
  const confirm = (await ctx.prompt('Send? [y/N] 🚀: ')).toLowerCase();
  if (confirm !== 'y') return 'cancelled';
  const send = sender || (async (roomId: string, text: string) => {
    try {
      await matrixSend(roomId, text);
    } catch (e: any) {
      console.error('Send failed:', e?.message || e);
      throw e;
    }
  });
  await send(item.roomId, safe);
  return 'sent';
}
