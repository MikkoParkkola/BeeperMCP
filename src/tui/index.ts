import blessed from 'blessed';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { openLogDb, queryLogs } from '../../utils.js';
import { refreshInbox, loadInbox, saveInbox, InboxItem } from '../cli/commands/inbox.js';
import { ensureRoomBrief, generateDrafts, TriagePrefs } from '../cli/commands/triage.js';
import { askQA } from '../cli/commands/qa.js';
import { sanitizeText } from '../security/sanitize.js';
import { checkGuardrails } from '../security/guardrails.js';
import { rateLimiter } from '../security/rateLimit.js';
import { sendMessage as matrixSend, createDm, createRoom, joinRoom } from '../matrix/client.js';
import { sendChat as providerSendChat } from '../cli/providers/index.js';
import type { ProviderConfig } from '../cli/helpers.js';
import { getTheme, setTheme, setPaletteColor, applyThemeToWidgets } from './theme.js';
import { getEffectiveTone, getEffectiveLanguage, setRoomOverrides, clearRoomOverrides, type Tone } from './overrides.js';
import { inferNetworkForRoom } from './network.js';
import { initNotifyState, computeInboxDelta, shouldBell } from './notify.js';

interface PersistedConfig {
  providers: Record<string, ProviderConfig>;
  active?: { provider?: string; model?: string };
  settings?: Record<string, unknown>;
}

function homeBase(): string {
  return process.env.BEEPERMCP_HOME || path.join(os.homedir(), '.BeeperMCP');
}
function configPath(): string {
  return path.join(homeBase(), 'config.json');
}
function sqlitePath(): string {
  const logDir = process.env.MESSAGE_LOG_DIR || path.join(homeBase(), 'room-logs');
  return path.join(logDir, 'messages.db');
}

function loadConfig(): PersistedConfig {
  try {
    const raw = fs.readFileSync(configPath(), 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed.providers) parsed.providers = {};
    return parsed;
  } catch {
    return { providers: {} } as PersistedConfig;
  }
}

function saveConfig(cfg: PersistedConfig) {
  try {
    fs.mkdirSync(homeBase(), { recursive: true, mode: 0o700 });
  } catch {}
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2), { mode: 0o600 });
}

function defaultPrefs(cfg: PersistedConfig): TriagePrefs {
  const aliases: string[] = String((cfg.settings as any)?.userAliases || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    userAliases: aliases.length ? aliases : ['@you:server'],
    tone: ((cfg.settings as any)?.tone as any) || 'concise',
    language: (cfg.settings as any)?.language as string | undefined,
  };
}

async function getAskFn(): Promise<null | ((prompt: string) => Promise<string>)> {
  const cfg = loadConfig();
  const active = cfg.active?.provider && cfg.providers[cfg.active.provider];
  const model = cfg.active?.model;
  if (!active || !model) return null;
  return async (p: string) => providerSendChat(active, model, [{ role: 'user', content: p }]);
}

function parseLine(line: string): { ts: string; sender: string; text: string } | null {
  const m = line.match(/^\[(.+?)\]\s+<([^>]+)>\s+(.*)$/);
  return m ? { ts: m[1], sender: m[2], text: m[3] } : null;
}

function firstNonEnumeratedLine(text: string): string {
  const pick = text
    .split(/\n+/)
    .map((s) => s.trim())
    .filter((s) => s && !/^\d+\)/.test(s))[0];
  return (pick || text || '').trim();
}

type ViewMode = 'threads' | 'inbox' | 'contacts';

export async function runTui() {
  const screen = blessed.screen({ smartCSR: true, title: 'BeeperMCP – TUI' });
  const cfg = loadConfig();
  const prefs = defaultPrefs(cfg);

  // UI widgets
  const status = blessed.box({ top: 0, left: 0, height: 1, width: '100%', tags: true, style: { fg: 'white', bg: 'blue' }, content: ' BeeperMCP – Threads (/:commands | q:quit)' });
  const list = blessed.list({ top: 1, left: 0, width: '30%', height: '100%-4', keys: true, vi: true, mouse: true, border: 'line', label: ' Rooms ', style: { selected: { bg: 'cyan', fg: 'black' } }, tags: true });
  const messages = blessed.box({ top: 1, left: '30%', width: '40%', height: '100%-4', border: 'line', label: ' Messages ', scrollable: true, alwaysScroll: true, keys: true, mouse: true, scrollbar: { ch: ' ', inverse: true } });
  const side = blessed.box({ top: 1, left: '70%', width: '30%', height: '100%-4', border: 'line', label: ' Panel ', scrollable: true, alwaysScroll: true, keys: true, mouse: true, scrollbar: { ch: ' ', inverse: true } });
  const footer = blessed.box({ bottom: 3, left: 0, height: 1, width: '100%', tags: true, style: { fg: 'white' }, content: '' });
  const input = blessed.textbox({ bottom: 0, left: 0, width: '100%', height: 3, inputOnFocus: true, border: 'line', label: ' Input ', keys: true });

  screen.append(status);
  screen.append(list);
  screen.append(messages);
  screen.append(side);
  screen.append(footer);
  screen.append(input);

  // State
  let db: any = null;
  const dbFile = sqlitePath();
  if (fs.existsSync(dbFile)) db = openLogDb(dbFile);
  let view: ViewMode = 'threads';
  let rooms: string[] = [];
  let inbox: InboxItem[] = [];
  let contacts: { name: string; rooms: string[] }[] = [];
  let roomCursor = 0;
  let inboxCursor = 0;
  let contactCursor = 0;
  let currentRoom: string | null = null;
  let currentContact: string | null = null;
  let lastDrafts: string[] = [];
  let filterTerm: string = '';
  let notify = initNotifyState();
  let lastNewIds: Set<string> = new Set<string>();
  let legendVisible = Boolean((cfg.settings as any)?.legendVisible ?? true);
  type Density = 'compact' | 'cozy' | 'ultra';
  let viewDensity: Density = ((cfg.settings as any)?.viewDensity as any) || 'cozy';
  let viewDensityMap: Partial<Record<ViewMode, Density>> =
    ((cfg.settings as any)?.viewDensityMap as any) || {};

  function densityFor(v: ViewMode): Density {
    const d = (viewDensityMap as any)[v];
    if (d === 'compact' || d === 'cozy' || d === 'ultra') return d;
    return viewDensity;
  }

  function netTagForRoom(rid: string): string {
    if (!db) return '';
    const t = inferNetworkForRoom(db, rid);
    return t === '?' ? '' : t;
  }

  // Helpers
  function setStatus(msg: string, color: 'green' | 'red' | 'blue' = 'blue') {
    status.style.bg = color === 'blue' ? 'blue' : color === 'green' ? 'green' : 'red';
    status.setContent(` ${msg}`);
    screen.render();
  }
  function updateStatus() {
    const viewName = view === 'threads' ? 'Threads' : view === 'inbox' ? 'Inbox' : 'Contacts';
    let toneLang = '';
    const cfgNow = loadConfig();
    if (!legendVisible) {
      if (view === 'threads' && currentRoom) {
        const t = getEffectiveTone(cfgNow, currentRoom);
        const l = getEffectiveLanguage(cfgNow, currentRoom);
        toneLang = ` | tone:${t}${l ? ` lang:${l}` : ''}`;
      } else if (view === 'contacts' && currentContact) {
        const group = contacts.find((c) => c.name === currentContact);
        if (group) {
          const tones = new Set(group.rooms.map((r) => getEffectiveTone(cfgNow, r)));
          const langs = new Set(group.rooms.map((r) => getEffectiveLanguage(cfgNow, r)));
          const nets = new Set(group.rooms.map((r) => netTagForRoom(r)).filter(Boolean));
          const t = tones.size === 1 ? [...tones][0] : 'mixed';
          const l = langs.size === 1 ? [...langs][0] : 'mixed';
          const n = nets.size === 1 ? ` net:${[...nets][0]}` : '';
          toneLang = ` | tone:${t}${l ? ` lang:${l}` : ''}${n}`;
        }
      }
    }
    const roomsCount = view === 'contacts' && currentContact ? (() => {
      const g = contacts.find((c) => c.name === currentContact);
      return g ? ` | rooms:${g.rooms.length}` : '';
    })() : '';
    const newCount = lastNewIds?.size ? ` | inbox:${lastNewIds.size} new` : '';
    const dens = !legendVisible ? ` | dens:${densityFor(view)}` : '';
    status.style.bg = 'blue';
    status.setContent(` BeeperMCP – ${viewName}${toneLang}${roomsCount}${newCount}${dens}`);
    screen.render();
  }

  function updateLegend() {
    const pal = getTheme(loadConfig());
    const legend = view === 'inbox'
      ? `{${pal.dim}-fg}Keys:{/${pal.dim}-fg} Enter:draft  p:pick  e:edit  /help`
      : view === 'threads'
        ? `{${pal.dim}-fg}Keys:{/${pal.dim}-fg} Enter:open  p:pick  e:edit  /help`
        : `{${pal.dim}-fg}Keys:{/${pal.dim}-fg} Enter:view  p:pick  e:edit  /help`;
    footer.hidden = !legendVisible;
    if (!footer.hidden) footer.setContent(legend);
    screen.render();
  }
  function renderList() {
    if (view === 'threads') {
      list.setLabel(' Rooms ');
      const filtered = filterTerm
        ? rooms.filter((r) => r.toLowerCase().includes(filterTerm.toLowerCase()))
        : rooms;
      const items = filtered.length
        ? filtered.map((r, i) => {
            const d = densityFor('threads');
            const marker = i === roomCursor ? '▶ ' : '  ';
            if (d === 'compact' || d === 'ultra') return `${marker}${r}`;
            const net = netTagForRoom(r);
            const tag = net ? ` [${net}]` : '';
            const tone = getEffectiveTone(loadConfig(), r);
            const lang = getEffectiveLanguage(loadConfig(), r);
            const badges = [tone ? `tone:${tone}` : '', lang ? `lang:${lang}` : '']
              .filter(Boolean)
              .map((b) => `[${b}]`)
              .join(' ');
            return `${marker}${r}${tag}${badges ? ' ' + badges : ''}`;
          })
        : ['No rooms found'];
      list.setItems(items);
      list.select(roomCursor);
    } else {
      if (view === 'inbox') {
        list.setLabel(' Inbox ');
        const open = inbox
          .filter((i) => i.status === 'open')
          .filter((i) =>
            filterTerm
              ? `${i.sender} ${i.preview}`
                  .toLowerCase()
                  .includes(filterTerm.toLowerCase())
              : true,
          );
        const pal = getTheme(loadConfig());
        const d = densityFor('inbox');
        const items = open.map((i, idx) => {
          const isNew = lastNewIds.has(i.id);
          const caret = idx === inboxCursor ? '▶ ' : '  ';
          const bullet = isNew ? `{${pal.highlight}-fg}•{/${pal.highlight}-fg} ` : '';
          if (d === 'ultra') {
            const preview = i.preview.slice(0, 50);
            return `${caret}${bullet}${preview}`;
          }
          const preview = d === 'compact' ? i.preview.slice(0, 80) : i.preview.slice(0, 120);
          return `${caret}${bullet}${new Date(i.ts).toLocaleString()}  ${i.sender}  ${preview}`;
        });
        list.setItems(items.length ? items : ['No open conversations']);
        list.select(inboxCursor);
      } else {
        list.setLabel(' Contacts ');
        const filtered = filterTerm
          ? contacts.filter((c) => c.name.toLowerCase().includes(filterTerm.toLowerCase()))
          : contacts;
        const items = filtered.map((c, idx) => {
          const netSet = new Set(c.rooms.map((r) => netTagForRoom(r) || '?'));
          const nets = Array.from(netSet).join(',');
          const cfgNow = loadConfig();
          const tones = new Set(c.rooms.map((r) => getEffectiveTone(cfgNow, r)));
          const langs = new Set(c.rooms.map((r) => getEffectiveLanguage(cfgNow, r)));
          const d = densityFor('contacts');
          if (d === 'ultra') return `${idx === contactCursor ? '▶ ' : '  '}${c.name}`;
          const tb = d === 'compact' ? '' : (tones.size === 1 ? ` [tone:${[...tones][0]}]` : '');
          const lb = d === 'compact' ? '' : (langs.size === 1 && [...langs][0] ? ` [lang:${[...langs][0]}]` : '');
          const nb = netSet.size === 1 && !netSet.has('') && !netSet.has('?') ? ` [net:${[...netSet][0]}]` : ` [${nets}]`;
          return `${idx === contactCursor ? '▶ ' : '  '}${c.name} (${c.rooms.length})${d === 'compact' ? '' : nb}${tb}${lb}`;
        });
        list.setItems(items.length ? items : ['No contacts found']);
        list.select(contactCursor);
      }
    }
    screen.render();
  }
  function renderMessages() {
    if (!db) {
      messages.setContent('No logs database found.');
      screen.render();
      return;
    }
    if (view === 'contacts' && currentContact) {
      const group = contacts.find((c) => c.name === currentContact);
      if (!group) {
        messages.setContent('Select a contact.');
        screen.render();
        return;
      }
      let merged: { ts: string; sender: string; text: string; room: string }[] = [];
      for (const r of group.rooms) {
        const lines = queryLogs(db, r, 100, undefined, undefined, undefined) || [];
        const parsed = lines
          .map(parseLine)
          .filter(Boolean)
          .map((p) => ({ ...p!, room: r }));
        merged = merged.concat(parsed as any);
      }
      merged.sort((a, b) => a.ts.localeCompare(b.ts));
      const out = merged
        .slice(-200)
        .map((m) => {
          const net = netTagForRoom(m.room) || '';
          return `[${m.ts}] (${net}) <${m.sender}> ${m.text}`;
        })
        .join('\n');
      messages.setContent(out || '(no recent messages)');
      messages.setScroll(messages.getScrollHeight());
      screen.render();
      return;
    }
    if (!currentRoom) {
      messages.setContent('No room selected. Use /open or pick from Rooms/Contacts.');
      screen.render();
      return;
    }
    const lines = queryLogs(db, currentRoom, 200, undefined, undefined, undefined) || [];
    const parsed = lines.map(parseLine).filter(Boolean) as any[];
    const body = parsed.map((p) => `[${p.ts}] <${p.sender}> ${p.text}`).join('\n');
    messages.setContent(body || '(no recent messages)');
    messages.setScroll(messages.getScrollHeight());
    screen.render();
  }
  async function refreshRooms() {
    try {
      if (!db) {
        rooms = [];
        return;
      }
      const rows = db.prepare('SELECT DISTINCT room_id FROM logs ORDER BY room_id').all();
      rooms = rows.map((r: any) => r.room_id);
      if (!currentRoom && rooms.length) currentRoom = rooms[0];
      renderList();
      renderMessages();
      updateStatus();
      updateLegend();
    } catch (e: any) {
      setStatus(`Failed to load rooms: ${e?.message || e}`, 'red');
    }
  }
  async function refreshInboxView() {
    try {
      const prev = notify;
      const cfgNow = loadConfig();
      inbox = await refreshInbox(prefs, 24);
      const delta = computeInboxDelta(prev, inbox);
      notify = delta.updatedState;
      lastNewIds = delta.newIds;
      if (delta.newCount > 0 && shouldBell(cfgNow)) {
        try { process.stdout.write('\u0007'); } catch {}
      }
      renderList();
      updateStatus();
      updateLegend();
    } catch (e: any) {
      setStatus(`Inbox refresh failed: ${e?.message || e}`, 'red');
    }
  }

  function normalizeContactName(sender: string): string {
    // Strip @ and :domain from matrix IDs, keep base name
    const m = sender.match(/^@([^:]+):/);
    return m ? m[1] : sender.replace(/^@/, '');
  }
  function computeContacts() {
    if (!db) {
      contacts = [];
      return;
    }
    const map = new Map<string, Set<string>>();
    for (const r of rooms) {
      const lines = queryLogs(db, r, 20, undefined, undefined, undefined) || [];
      for (let i = lines.length - 1; i >= 0; i--) {
        const p = parseLine(lines[i]);
        if (!p?.sender) continue;
        // Choose a non-self sender as contact
        if (prefs.userAliases.some((a) => a && p.sender.includes(a))) continue;
        const name = normalizeContactName(p.sender);
        if (!map.has(name)) map.set(name, new Set());
        map.get(name)!.add(r);
        break;
      }
    }
    contacts = Array.from(map.entries())
      .map(([name, set]) => ({ name, rooms: Array.from(set.values()) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  // Commands
  async function handleCommand(line: string) {
    const [cmd, ...rest] = line.replace(/^\//, '').trim().split(/\s+/);
    const argline = rest.join(' ');
    if (cmd === 'help') {
      side.setLabel(' Help ');
      side.setContent(`Commands:\n/threads – show rooms view\n/inbox – show inbox view\n/contacts – merged per-person view\n/rooms – refresh rooms\n/open <room|@user|#alias|name> – open/DM/join/create\n/join <#alias|!roomId> [server...] – join room\n/dm @user:hs – start a DM\n/draft [intention] [extra...] – generate drafts\n/revise <instructions> – refine current input\n/brief – show room brief\n/watchtower – brief + key recents\n/qa <question> – ask over this room\n/tone <concise|friendly|formal> – set tone\n/lang <code> – set default language\n/tone-room <concise|friendly|formal|unset> – set/clear tone for room\n/lang-room <code|unset> – set/clear language for room\n/clear-room-overrides – clear room overrides\n/theme <dark|light|high-contrast> – change theme\n/palette <key> <color> | reset – tweak theme colors\n/bell [on|off] – toggle notification bell\n/view <compact|cozy|ultra> OR /view <threads|inbox|contacts> <compact|cozy|ultra>\n/legend [on|off] – toggle footer legend\n/keys – show keybindings\n/aliases a,b – set your handles\n/search <term> – open search pane\n/clearsearch – clear filter\n/accept – send first draft line\n/dismiss – dismiss current inbox item\n/snooze <2h|tonight|tomorrow> – snooze inbox item\n/send – send input\n/help – this help`);
      screen.render();
      return;
    }
    if (cmd === 'theme') {
      const name = (rest[0] || '').toLowerCase();
      if (!['dark', 'light', 'high-contrast'].includes(name)) {
        setStatus('Usage: /theme <dark|light|high-contrast>', 'red');
        return;
      }
      const cfgx = setTheme(loadConfig(), name as any);
      saveConfig(cfgx as any);
      const pal = getTheme(cfgx as any);
      applyThemeToWidgets(pal, { status, list, messages, side, input });
      screen.render();
      return;
    }
    if (cmd === 'palette') {
      const sub = (rest[0] || '').toLowerCase();
      if (sub === 'reset') {
        const cfgx = loadConfig();
        cfgx.settings = cfgx.settings || {};
        if ((cfgx.settings as any).customTheme) delete (cfgx.settings as any).customTheme;
        saveConfig(cfgx as any);
        const pal = getTheme(cfgx as any);
        applyThemeToWidgets(pal, { status, list, messages, side, input });
        updateLegend();
        setStatus('Palette reset to base theme', 'green');
        return;
      }
      const key = sub as any;
      const value = rest[1];
      const allowed: (keyof ReturnType<typeof getTheme>)[] = [
        'bg','fg','accent','warning','error','listSelectedBg','listSelectedFg','highlight','dim',
      ] as any;
      if (!key || !value || !(allowed as any).includes(key)) {
        setStatus('Usage: /palette <bg|fg|accent|warning|error|listSelectedBg|listSelectedFg|highlight|dim> <color> | /palette reset', 'red');
        return;
      }
      const cfgx = setPaletteColor(loadConfig(), key, value);
      saveConfig(cfgx as any);
      const pal = getTheme(cfgx as any);
      applyThemeToWidgets(pal, { status, list, messages, side, input });
      updateLegend();
      setStatus(`Palette ${String(key)}=${value}`, 'green');
      return;
    }
    if (cmd === 'keys') {
      const legend = view === 'inbox'
        ? `Enter:draft  p:pick  e:edit  /help`
        : view === 'threads'
          ? `Enter:open  p:pick  e:edit  /help`
          : `Enter:view  p:pick  e:edit  /help`;
      side.setLabel(' Keys ');
      side.setContent(`Current view: ${view}\n${legend}\n\nToggle footer legend with /legend on|off.`);
      screen.render();
      return;
    }
    if (cmd === 'legend') {
      const arg = (rest[0] || '').toLowerCase();
      if (arg === 'on') legendVisible = true;
      else if (arg === 'off') legendVisible = false;
      else legendVisible = !legendVisible;
      const cfgx = loadConfig();
      cfgx.settings = cfgx.settings || {};
      (cfgx.settings as any).legendVisible = legendVisible;
      saveConfig(cfgx);
      updateLegend();
      setStatus(`Legend ${legendVisible ? 'shown' : 'hidden'}`, 'green');
      return;
    }
    if (cmd === 'contacts') {
      view = 'contacts';
      computeContacts();
      contactCursor = 0;
      currentContact = contacts[0]?.name || null;
      renderList();
      renderMessages();
      setStatus('BeeperMCP – Contacts (/:commands | q:quit)');
      updateStatus();
      updateLegend();
      return;
    }
    if (cmd === 'threads') {
      view = 'threads';
      setStatus('BeeperMCP – Threads (/:commands | q:quit)');
      renderList();
      updateStatus();
      return;
    }
    if (cmd === 'inbox') {
      view = 'inbox';
      await refreshInboxView();
      setStatus('BeeperMCP – Inbox (/:commands | q:quit)');
      updateStatus();
      return;
    }
    if (cmd === 'rooms') {
      await refreshRooms();
      return;
    }
    if (cmd === 'view') {
      const v1 = (rest[0] || '').toLowerCase();
      const v2 = (rest[1] || '').toLowerCase();
      const isView = ['threads', 'inbox', 'contacts'].includes(v1);
      const densities = ['compact', 'cozy', 'ultra'];
      if (v1 === 'show') {
        const def = viewDensity;
        const t = densityFor('threads');
        const i = densityFor('inbox');
        const c = densityFor('contacts');
        side.setLabel(' View ');
        side.setContent(
          `Default: ${def}\nthreads: ${t}\ninbox: ${i}\ncontacts: ${c}`,
        );
        screen.render();
        return;
      }
      if (isView) {
        if (!densities.includes(v2)) {
          setStatus('Usage: /view <threads|inbox|contacts> <compact|cozy|ultra>', 'red');
          return;
        }
        const cfgx = loadConfig();
        cfgx.settings = cfgx.settings || {};
        const map = ((cfgx.settings as any).viewDensityMap || {}) as any;
        map[v1] = v2;
        (cfgx.settings as any).viewDensityMap = map;
        viewDensityMap = map;
        saveConfig(cfgx);
        renderList();
        setStatus(`View density for ${v1}: ${v2}`, 'green');
        return;
      }
      // global default
      if (!densities.includes(v1)) {
        setStatus('Usage: /view <compact|cozy|ultra> OR /view <threads|inbox|contacts> <compact|cozy|ultra>', 'red');
        return;
      }
      viewDensity = v1 as any;
      const cfgx = loadConfig();
      cfgx.settings = cfgx.settings || {};
      (cfgx.settings as any).viewDensity = viewDensity;
      saveConfig(cfgx);
      renderList();
      setStatus(`View density default: ${viewDensity}`, 'green');
      return;
    }
    if (cmd === 'search') {
      const term = argline.trim();
      if (!term) { setStatus('Usage: /search <term>', 'red'); return; }
      await openSearchModal(term);
      return;
    }
    if (cmd === 'clearsearch') {
      filterTerm = '';
      renderList();
      return;
    }
    if (cmd === 'open') {
      const target = argline.trim();
      if (!target) {
        setStatus('Usage: /open <roomId|@user|name>', 'red');
        return;
      }
      try {
        if (target.startsWith('@')) {
          const r = await createDm(target);
          currentRoom = r.room_id;
        } else if (target.startsWith('!')) {
          currentRoom = target;
        } else if (target.startsWith('#')) {
          const r = await joinRoom(target);
          currentRoom = r.room_id;
        } else {
          const r = await createRoom({ name: target });
          currentRoom = r.room_id;
        }
        await refreshRooms();
        renderMessages();
        setStatus(`Opened ${currentRoom}`, 'green');
      } catch (e: any) {
        setStatus(`Open failed: ${e?.message || e}`, 'red');
      }
      return;
    }
    if (cmd === 'join') {
      const tokens = argline.trim().split(/\s+/).filter(Boolean);
      const aliasOrId = tokens.shift() || '';
      if (!aliasOrId) {
        setStatus('Usage: /join <#alias:hs|!roomId>', 'red');
        return;
      }
      try {
        const r = await joinRoom(aliasOrId, tokens.length ? tokens : undefined);
        currentRoom = r.room_id;
        await refreshRooms();
        renderMessages();
        setStatus(`Joined ${aliasOrId}`, 'green');
      } catch (e: any) {
        setStatus(`Join failed: ${e?.message || e}`, 'red');
      }
      return;
    }
    if (cmd === 'dm') {
      const user = argline.trim();
      if (!user || !user.startsWith('@')) {
        setStatus('Usage: /dm @user:hs', 'red');
        return;
      }
      try {
        const r = await createDm(user);
        currentRoom = r.room_id;
        await refreshRooms();
        renderMessages();
        setStatus(`DM with ${user}`, 'green');
      } catch (e: any) {
        setStatus(`DM failed: ${e?.message || e}`, 'red');
      }
      return;
    }
    if (cmd === 'brief') {
      if (!currentRoom) return setStatus('No room selected', 'red');
      const ask = await getAskFn();
      if (!ask) return setStatus('No active provider configured', 'red');
      const brief = await ensureRoomBrief(currentRoom, ask);
      side.setLabel(' Brief ');
      side.setContent(`LANG: ${brief.language || ''}\nSTYLE:\n- ${(brief.styleHints || []).join('\n- ')}\nAUDIENCE:\n- ${(brief.audienceNotes || []).join('\n- ')}\nSENSITIVITIES:\n- ${(brief.sensitivities || []).join('\n- ')}`);
      screen.render();
      updateStatus();
      return;
    }
    if (cmd === 'tone-room') {
      if (!currentRoom) return setStatus('No room selected', 'red');
      const arg = (rest[0] || '').toLowerCase();
      if (arg === 'unset') {
        const cfgx = loadConfig();
        cfgx.settings = cfgx.settings || {};
        const map = (cfgx.settings as any).roomOverrides || {};
        if (map[currentRoom]) {
          delete map[currentRoom].tone;
          if (!map[currentRoom].tone && !map[currentRoom].language) delete map[currentRoom];
          (cfgx.settings as any).roomOverrides = map;
          saveConfig(cfgx);
        }
        renderList();
        setStatus('Cleared room tone override', 'green');
        return;
      }
      const t = arg as Tone;
      if (!['concise', 'friendly', 'formal'].includes(t)) return setStatus('Usage: /tone-room <concise|friendly|formal|unset>', 'red');
      const cfgx = setRoomOverrides(loadConfig(), currentRoom, { tone: t });
      saveConfig(cfgx as any);
      renderList();
      setStatus(`Set room tone ${t}`, 'green');
      return;
    }
    if (cmd === 'lang-room') {
      if (!currentRoom) return setStatus('No room selected', 'red');
      const code = (rest[0] || '').trim();
      if (!code) return setStatus('Usage: /lang-room <code|unset>', 'red');
      if (code.toLowerCase() === 'unset') {
        const cfgx = loadConfig();
        cfgx.settings = cfgx.settings || {};
        const map = (cfgx.settings as any).roomOverrides || {};
        if (map[currentRoom]) {
          delete map[currentRoom].language;
          if (!map[currentRoom].tone && !map[currentRoom].language) delete map[currentRoom];
          (cfgx.settings as any).roomOverrides = map;
          saveConfig(cfgx);
        }
        renderList();
        setStatus('Cleared room lang override', 'green');
      } else {
        const cfgx = setRoomOverrides(loadConfig(), currentRoom, { language: code });
        saveConfig(cfgx as any);
        renderList();
        setStatus(`Set room lang ${code}`, 'green');
      }
      return;
    }
    if (cmd === 'clear-room-overrides') {
      if (!currentRoom) return setStatus('No room selected', 'red');
      const cfgx = clearRoomOverrides(loadConfig(), currentRoom);
      saveConfig(cfgx as any);
      renderList();
      setStatus('Cleared room overrides', 'green');
      return;
    }
    if (cmd === 'watchtower') {
      if (!currentRoom) return setStatus('No room selected', 'red');
      const ask = await getAskFn();
      if (!ask) return setStatus('No active provider configured', 'red');
      const brief = await ensureRoomBrief(currentRoom, ask);
      const lines = db ? queryLogs(db, currentRoom, 30, undefined, undefined, undefined) || [] : [];
      const recent = lines.slice(-10).join('\n');
      side.setLabel(' Watchtower ');
      side.setContent(`LANG: ${brief.language || ''}\nSTYLE:\n- ${(brief.styleHints || []).join('\n- ')}\nAUDIENCE:\n- ${(brief.audienceNotes || []).join('\n- ')}\nSENSITIVITIES:\n- ${(brief.sensitivities || []).join('\n- ')}\n\nRecent:\n${recent}`);
      screen.render();
      updateStatus();
      return;
    }
    if (cmd === 'draft') {
      if (!currentRoom) return setStatus('No room selected', 'red');
      const ask = await getAskFn();
      if (!ask) return setStatus('No active provider configured', 'red');
      const [intention, ...extraArr] = rest;
      const extra = extraArr.join(' ');
      const lines = db ? queryLogs(db, currentRoom, 30, undefined, undefined, undefined) || [] : [];
      const last = lines.slice(-1)[0] || '';
      const parsed = parseLine(last);
      const sourceText = parsed ? parsed.text : '';
      const out = await generateDrafts(
        { roomId: currentRoom, sender: parsed?.sender || '', ts: parsed?.ts || new Date().toISOString(), text: sourceText, context: lines.slice(-5) } as any,
        prefs,
        intention || 'inform',
        extra,
        ask,
      );
      lastDrafts = out.split(/\n\s*\n/).slice(0, 2);
      side.setLabel(' Drafts ');
      side.setContent(out);
      // Pre-fill input with first
      input.setValue(firstNonEnumeratedLine(out));
      screen.render();
      return;
    }
    if (cmd === 'revise') {
      if (!currentRoom) return setStatus('No room selected', 'red');
      const ask = await getAskFn();
      if (!ask) return setStatus('No active provider configured', 'red');
      const base = input.getValue() || firstNonEnumeratedLine(side.getContent() || '');
      if (!base) return setStatus('Nothing to revise', 'red');
      const instructions = argline || 'make it clearer and friendlier';
      // Use brief + prompt to revise: quick reuse of generateDrafts by providing base as context and extra instructions
      const out = await generateDrafts(
        { roomId: currentRoom, sender: '', ts: new Date().toISOString(), text: base, context: [base] } as any,
        prefs,
        'inform',
        instructions,
        ask,
      );
      lastDrafts = out.split(/\n\s*\n/).slice(0, 2);
      side.setLabel(' Revised ');
      side.setContent(out);
      input.setValue(firstNonEnumeratedLine(out));
      screen.render();
      return;
    }
    if (cmd === 'qa') {
      const ask = await getAskFn();
      if (!ask) return setStatus('No active provider configured', 'red');
      const q = argline.trim();
      if (!q) return setStatus('Usage: /qa <question>', 'red');
      const res = await askQA(q, { rooms: currentRoom ? [currentRoom] : undefined }, (p: string) => ask(p));
      side.setLabel(' QA ');
      side.setContent(`${res.answer}\n\nContext:\n${res.contextPreview}`);
      screen.render();
      return;
    }
    if (cmd === 'tone') {
      const tone = (rest[0] || '').toLowerCase();
      if (!['concise', 'friendly', 'formal'].includes(tone)) return setStatus('Usage: /tone concise|friendly|formal', 'red');
      const cur = loadConfig();
      cur.settings = cur.settings || {};
      (cur.settings as any).tone = tone;
      saveConfig(cur);
      setStatus(`Tone set to ${tone}`, 'green');
      return;
    }
    if (cmd === 'lang') {
      const code = rest[0];
      if (!code) return setStatus('Usage: /lang <code>', 'red');
      const cur = loadConfig();
      cur.settings = cur.settings || {};
      (cur.settings as any).language = code;
      saveConfig(cur);
      setStatus(`Language set to ${code}`, 'green');
      return;
    }
    if (cmd === 'aliases') {
      const csv = argline.trim();
      if (!csv) return setStatus('Usage: /aliases @you:hs,@alt:hs', 'red');
      const cur = loadConfig();
      cur.settings = cur.settings || {};
      (cur.settings as any).userAliases = csv;
      saveConfig(cur);
      setStatus('Aliases updated', 'green');
      return;
    }
    if (cmd === 'accept') {
      const text = firstNonEnumeratedLine(side.getContent() || input.getValue() || '');
      if (!currentRoom || !text) return setStatus('Nothing to send', 'red');
      await sendInput(text);
      return;
    }
    if (cmd === 'send') {
      const text = input.getValue();
      if (!text) return setStatus('Input is empty', 'red');
      await sendInput(text);
      return;
    }
    if (cmd === 'dismiss') {
      if (view !== 'inbox') return setStatus('Switch to /inbox first', 'red');
      const open = inbox.filter((i) => i.status === 'open');
      const it = open[inboxCursor];
      if (!it) return setStatus('No inbox item selected', 'red');
      const all = loadInbox();
      const idx = all.findIndex((x) => x.id === it.id);
      if (idx >= 0) {
        all[idx].status = 'dismissed';
        saveInbox(all);
      }
      await refreshInboxView();
      setStatus('Dismissed', 'green');
      return;
    }
    if (cmd === 'snooze') {
      if (view !== 'inbox') return setStatus('Switch to /inbox first', 'red');
      const opt = (rest[0] || '2h') as '2h' | 'tonight' | 'tomorrow';
      const open = inbox.filter((i) => i.status === 'open');
      const it = open[inboxCursor];
      if (!it) return setStatus('No inbox item selected', 'red');
      const now = new Date();
      let until = Date.now() + 2 * 3600_000;
      if (opt === 'tonight') { const end = new Date(now); end.setHours(22, 0, 0, 0); until = end.getTime(); }
      if (opt === 'tomorrow') { const t = new Date(now); t.setDate(t.getDate() + 1); t.setHours(9, 0, 0, 0); until = t.getTime(); }
      const all = loadInbox();
      const idx = all.findIndex((x) => x.id === it.id);
      if (idx >= 0) { all[idx].status = 'snoozed'; all[idx].snoozeUntil = until; saveInbox(all); }
      await refreshInboxView();
      setStatus(`Snoozed ${opt}`, 'green');
      return;
    }
    setStatus(`Unknown command: /${cmd}`, 'red');
  }

  // Sending
  async function sendInput(text: string) {
    if (!currentRoom) return setStatus('No room selected', 'red');
    try {
      rateLimiter('cli_send', 10);
    } catch {
      return setStatus('Rate limited', 'red');
    }
    const safe = sanitizeText(text.trim());
    const gr = checkGuardrails(safe, prefs.userAliases[0]);
    if (!gr.ok) return setStatus(`Blocked: ${gr.reason}`, 'red');
    try {
      await matrixSend(currentRoom, safe);
      setStatus('Sent', 'green');
      renderMessages();
    } catch (e: any) {
      setStatus(`Send failed: ${e?.message || e}`, 'red');
    }
  }

  // Keys
  screen.key(['q', 'C-c'], () => process.exit(0));
  list.key(['up', 'k'], () => {
    if (view === 'threads') {
      roomCursor = Math.max(0, roomCursor - 1);
    } else if (view === 'inbox') {
      inboxCursor = Math.max(0, inboxCursor - 1);
    } else {
      contactCursor = Math.max(0, contactCursor - 1);
      currentContact = contacts[contactCursor]?.name || currentContact;
    }
    renderList();
    if (view === 'threads') {
      currentRoom = rooms[roomCursor] || currentRoom;
      renderMessages();
    } else if (view === 'contacts') {
      renderMessages();
    }
  });
  list.key(['down', 'j'], () => {
    if (view === 'threads') {
      roomCursor = Math.min(Math.max(0, rooms.length - 1), roomCursor + 1);
    } else if (view === 'inbox') {
      const open = inbox.filter((i) => i.status === 'open');
      inboxCursor = Math.min(Math.max(0, open.length - 1), inboxCursor + 1);
    } else {
      contactCursor = Math.min(Math.max(0, contacts.length - 1), contactCursor + 1);
      currentContact = contacts[contactCursor]?.name || currentContact;
    }
    renderList();
    if (view === 'threads') {
      currentRoom = rooms[roomCursor] || currentRoom;
      renderMessages();
    } else if (view === 'contacts') {
      renderMessages();
    }
  });
  list.key(['enter'], async () => {
    if (view === 'threads') {
      currentRoom = rooms[roomCursor] || currentRoom;
      renderMessages();
    } else if (view === 'inbox') {
      // inbox: generate drafts for selected item
      const open = inbox.filter((i) => i.status === 'open');
      const it = open[inboxCursor];
      if (!it) return;
      const ask = await getAskFn();
      if (!ask) return setStatus('No active provider configured', 'red');
      const out = await generateDrafts(
        { roomId: it.roomId, sender: it.sender, ts: it.ts, text: it.preview, context: [it.preview] } as any,
        prefs,
        'inform',
        '',
        ask,
      );
      lastDrafts = out.split(/\n\s*\n/).slice(0, 2);
      side.setLabel(' Drafts ');
      side.setContent(out);
      input.setValue(firstNonEnumeratedLine(out));
      screen.render();
    } else if (view === 'contacts') {
      currentContact = contacts[contactCursor]?.name || currentContact;
      renderMessages();
    }
  });
  // Quick pick between last drafts
  screen.key(['p'], () => {
    if (!lastDrafts.length) return setStatus('No drafts to pick from', 'red');
    const modal = blessed.list({
      parent: screen,
      top: 'center',
      left: 'center',
      width: '70%',
      height: '50%',
      border: 'line',
      label: ' Pick Draft ',
      keys: true,
      vi: true,
      mouse: true,
      items: lastDrafts,
      style: { selected: { bg: 'cyan', fg: 'black' } },
    });
    modal.focus();
    modal.on('select', (item: any, idx: number) => {
      const text = lastDrafts[idx] || '';
      input.setValue(text);
      screen.remove(modal);
      input.focus();
      screen.render();
    });
    modal.key(['escape', 'q'], () => {
      screen.remove(modal);
      input.focus();
      screen.render();
    });
    screen.render();
  });
  // Edit modal for input text
  screen.key(['e'], () => {
    const initial = input.getValue() || '';
    const editor = blessed.textarea({
      parent: screen,
      top: 'center',
      left: 'center',
      width: '80%',
      height: '60%',
      border: 'line',
      label: ' Edit Draft (Ctrl-S to save, Esc to cancel) ',
      keys: true,
      mouse: true,
      inputOnFocus: true,
      value: initial,
      scrollable: true,
      alwaysScroll: true,
    } as any);
    editor.focus();
    editor.key(['C-s'], () => {
      input.setValue(String((editor as any).getValue?.() || initial));
      screen.remove(editor);
      input.focus();
      screen.render();
    });
    editor.key(['escape', 'C-c'], () => {
      screen.remove(editor);
      input.focus();
      screen.render();
    });
    screen.render();
  });
  screen.key(['g'], () => messages.setScroll(0));
  screen.key(['G'], () => messages.setScroll(messages.getScrollHeight()));
  screen.key(['tab'], () => input.focus());
  messages.key(['tab'], () => input.focus());
  input.key(['C-u'], () => input.setValue(''));

  input.on('submit', async (value: string) => {
    const text = (value || '').trim();
    input.clearValue();
    input.focus();
    screen.render();
    if (!text) return;
    if (text.startsWith('/')) return void (await handleCommand(text));
    await sendInput(text);
  });

  async function openSearchModal(term: string) {
    interface Result { type: 'room' | 'contact' | 'message'; label: string; roomId?: string; contact?: string; ts?: string }
    const results: Result[] = [];
    const t = term.toLowerCase();
    const roomHits = rooms.filter((r) => r.toLowerCase().includes(t));
    for (const r of roomHits) results.push({ type: 'room', label: `Room: ${r}`, roomId: r });
    const contactHits = contacts.filter((c) => c.name.toLowerCase().includes(t));
    for (const c of contactHits) results.push({ type: 'contact', label: `Contact: ${c.name}`, contact: c.name });
    if (db) {
      for (const r of rooms) {
        const lines = queryLogs(db, r, 400, undefined, undefined, undefined) || [];
        for (let i = lines.length - 1; i >= 0 && results.length < 200; i--) {
          const line = lines[i];
          if (line.toLowerCase().includes(t)) {
            const m = parseLine(line);
            const when = m?.ts || '';
            results.push({ type: 'message', label: `Msg@${when} ${r}: ${line.slice(0, 120)}`, roomId: r, ts: when });
          }
        }
      }
    }
    const modal = blessed.list({ parent: screen, top: 'center', left: 'center', width: '70%', height: '60%', border: 'line', label: ` Search: ${term} `, keys: true, vi: true, mouse: true, items: results.map((r) => r.label), style: { selected: { bg: 'cyan', fg: 'black' } } });
    modal.focus();
    const jump = (idx: number) => {
      const r = results[idx];
      if (!r) return;
      if (r.type === 'room' && r.roomId) {
        view = 'threads';
        currentRoom = r.roomId;
        roomCursor = Math.max(0, rooms.indexOf(r.roomId));
        renderList();
        renderMessages();
      } else if (r.type === 'contact' && r.contact) {
        view = 'contacts';
        currentContact = r.contact;
        contactCursor = Math.max(0, contacts.findIndex((c) => c.name === r.contact));
        renderList();
        renderMessages();
      } else if (r.type === 'message' && r.roomId) {
        view = 'threads';
        currentRoom = r.roomId;
        roomCursor = Math.max(0, rooms.indexOf(r.roomId));
        renderList();
        renderMessages();
        messages.setScroll(messages.getScrollHeight());
      }
      screen.remove(modal);
      input.focus();
      screen.render();
    };
    modal.on('select', (_item: any, idx: number) => jump(idx));
    modal.key(['enter'], () => jump((modal as any).selected));
    modal.key(['escape', 'q'], () => { screen.remove(modal); input.focus(); screen.render(); });
    screen.render();
  }

  // Background refresh timers
  setInterval(() => {
    if (view === 'threads') refreshRooms().catch(() => {});
    if (view === 'inbox') refreshInboxView().catch(() => {});
    if (currentRoom || (view === 'contacts' && currentContact)) renderMessages();
  }, 5000);

  // Initial
  await refreshRooms();
  renderList();
  renderMessages();
  input.focus();
  // Apply theme on start
  const pal = getTheme(loadConfig());
  applyThemeToWidgets(pal, { status, list, messages, side, input });
  screen.render();
}

if (import.meta.url === `file://${process.argv[1]}`) runTui();
