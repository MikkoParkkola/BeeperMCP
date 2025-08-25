import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { queryLogs } from './utils.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let pkg;
try {
  pkg = require('../package.json');
} catch {
  pkg = require('./package.json');
}
const { version } = pkg;

const logger = console;

/**
 * Build an MCP server instance with standard tools.
 * Requests must include the provided API key in `_meta.apiKey`.
 * @param {any} client Matrix client
 * @param {any} logDb SQLite database handle
 * @param {boolean} enableSend whether to register send_message tool
 * @param {string} apiKey API key required on each request
 * @param {string | undefined} logSecret optional log decryption secret
 * @param {Function} queryFn optional queryLogs override for testing
 * @returns {McpServer}
 */
export function buildMcpServer(
  client,
  logDb,
  enableSend,
  apiKey,
  logSecret,
  queryFn = queryLogs,
) {
  // If no apiKey is provided, disable API key enforcement (e.g., STDIO mode)
  const authDisabled = !apiKey;
  const srv = new McpServer({
    name: 'Beeper',
    version,
    description: 'Matrix↔MCP logger',
  });
  const scopesMap = new Map();
  if (!authDisabled) {
    String(apiKey)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((tok) => {
        const [k, sc = ''] = tok.split(':');
        scopesMap.set(
          k,
          new Set(sc ? sc.split(/[+.,]/) : ['tools', 'resources']),
        );
      });
  }
  const isAllowed = (key, scope) => {
    if (authDisabled) return true;
    const k = Array.isArray(key) ? key[0] : key;
    if (!k) return false;
    const s = scopesMap.get(k);
    if (!s) return false;
    return s.has(scope) || s.has('all');
  };

  const authWrapper = (cb) => {
    return (args, extra) => {
      if (!isAllowed(extra?._meta?.apiKey, 'tools'))
        throw new Error('Invalid API key');
      return cb(args, extra);
    };
  };

  srv.tool(
    'list_rooms',
    z.object({ limit: z.number().int().positive().default(50) }),
    authWrapper(async ({ limit }) => {
      const out = client
        .getRooms()
        .sort(
          (a, b) =>
            (b.getLastActiveTimestamp?.() || 0) -
            (a.getLastActiveTimestamp?.() || 0),
        )
        .slice(0, limit)
        .map((r) => ({ room_id: r.roomId, name: r.name }));
      return { content: [{ type: 'json', json: out }] };
    }),
  );

  srv.tool(
    'create_room',
    z.object({
      name: z.string().min(1),
      encrypted: z.boolean().default(false),
    }),
    authWrapper(async ({ name, encrypted }) => {
      const opts = { name, visibility: 'private' };
      if (encrypted)
        opts.initial_state = [
          {
            type: 'm.room.encryption',
            state_key: '',
            content: { algorithm: 'm.megolm.v1.aes-sha2' },
          },
        ];
      const { room_id } = await client.createRoom(opts);
      return { content: [{ type: 'json', json: { room_id } }] };
    }),
  );

  srv.tool(
    'list_messages',
    z.object({
      room_id: z.string(),
      limit: z.number().int().positive().optional(),
      since: z.string().datetime().optional(),
      until: z.string().datetime().optional(),
    }),
    authWrapper(async ({ room_id, limit, since, until }) => {
      let lines = [];
      try {
        lines = queryFn(logDb, room_id, limit, since, until, logSecret);
      } catch (err) {
        logger.warn('Failed to query logs', err);
      }
      return { content: [{ type: 'json', json: lines.filter(Boolean) }] };
    }),
  );

  if (enableSend) {
    // Approval-gated send
    srv.tool(
      'send_message',
      z.object({
        room_id: z.string(),
        draft_preview: z.string().min(1),
        send: z.boolean().optional(),
        persona_id: z.string().optional(),
      }),
      authWrapper(async ({ room_id, draft_preview, send, persona_id }) => {
        // rate limit
        try {
          const { rateLimiter } = await import(
            './dist/src/security/rateLimit.js'
          ).catch(async () => await import('./src/security/rateLimit.js'));
          rateLimiter('mcp_tools_send', 10);
        } catch {}
        // guardrails
        try {
          const { checkGuardrails } = await import(
            './dist/src/security/guardrails.js'
          ).catch(async () => await import('./src/security/guardrails.js'));
          const guard = checkGuardrails(
            String(draft_preview || ''),
            persona_id,
          );
          if (!guard.ok) {
            return {
              content: [
                { type: 'json', json: { sent: false, reason: guard.reason } },
              ],
            };
          }
        } catch {}
        if (!send) {
          return {
            content: [
              {
                type: 'json',
                json: {
                  sent: false,
                  reason: 'approval_required',
                  approvalForm: {
                    room_id,
                    draft_preview,
                    persona_id: persona_id || null,
                  },
                },
              },
            ],
          };
        }
        // sanitize
        let text = String(draft_preview || '');
        try {
          const { sanitizeText } = await import(
            './dist/src/security/sanitize.js'
          ).catch(async () => await import('./src/security/sanitize.js'));
          text = sanitizeText(text);
        } catch {}
        await client.sendTextMessage(room_id, text);
        return { content: [{ type: 'json', json: { sent: true } }] };
      }),
    );
  }

  // --- Inbox: list conversations likely needing reply ---
  srv.tool(
    'inbox_list',
    z.object({
      hours: z.number().int().positive().default(24),
      limit: z.number().int().positive().default(50),
      aliases: z.array(z.string()).default([]),
    }),
    authWrapper(async ({ hours, limit, aliases }) => {
      const items = [];
      if (!logDb) return { content: [{ type: 'json', json: { items } }] };
      const since = new Date(Date.now() - hours * 3600_000).toISOString();
      const rooms = logDb
        .prepare('SELECT DISTINCT room_id FROM logs ORDER BY room_id')
        .all()
        .map((r) => r.room_id);
      const looksActionable = (text) => {
        const t = String(text || '').toLowerCase();
        if (/\?$/.test(t)) return true;
        if (
          /(can you|could you|please|wdyt|what do you think|eta|any update)/i.test(
            t,
          )
        )
          return true;
        return aliases.some((a) => a && String(text || '').includes(a));
      };
      const parse = (line) => {
        const m = String(line).match(/^\[(.+?)\]\s+<([^>]+)>\s+(.*)$/);
        return m ? { ts: m[1], sender: m[2], text: m[3] } : null;
      };
      for (const roomId of rooms) {
        const rows = logDb
          .prepare(
            'SELECT ts, line FROM logs WHERE room_id = ? AND ts >= ? ORDER BY ts ASC',
          )
          .all(roomId, since);
        const parsed = rows.map((r) => parse(r.line)).filter(Boolean);
        for (let i = parsed.length - 1; i >= 0; i--) {
          const p = parsed[i];
          if (!p) continue;
          if (aliases.some((a) => a && p.sender.includes(a))) continue; // user message
          if (!looksActionable(p.text)) continue;
          const replied = parsed
            .slice(i + 1)
            .some((q) => aliases.some((a) => a && q.sender.includes(a)));
          if (replied) continue;
          items.push({
            id: `${roomId}:${p.ts}`,
            room_id: roomId,
            ts: p.ts,
            sender: p.sender,
            preview: p.text.slice(0, 120),
            status: 'open',
          });
          break;
        }
        if (items.length >= limit) break;
      }
      return { content: [{ type: 'json', json: { items } }] };
    }),
  );

  // --- Brief: return cached per-room brief (language/style/audience) ---
  const briefCache = new Map();
  srv.tool(
    'brief_room',
    z.object({ room_id: z.string() }),
    authWrapper(async ({ room_id }) => {
      const staleMs = 3 * 24 * 3600_000;
      const cached = briefCache.get(room_id);
      if (cached && Date.now() - cached._ts < staleMs) {
        return { content: [{ type: 'json', json: cached }] };
      }
      let lines = [];
      if (logDb) {
        const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
        const rows = logDb
          .prepare(
            'SELECT line FROM logs WHERE room_id = ? AND ts >= ? ORDER BY ts ASC',
          )
          .all(room_id, since);
        lines = rows.map((r) => r.line);
        if (lines.length > 400) {
          const step = Math.ceil(lines.length / 400);
          lines = lines.filter((_, i) => i % step === 0);
        }
      }
      const prompt = `You will create a BRIEF profile for a chat room based on recent messages.\nOUTPUT EXACTLY this format (no extra text):\nLANG: <2-letter code or language name>\nSTYLE:\n- <bullet about tone/emoji/formality/sign-offs>\nAUDIENCE:\n- <bullet about roles/expectations>\nSENSITIVITIES:\n- <bullet topics to avoid if any>\n\nMESSAGES SAMPLE (recent):\n${lines.join('\n')}`;
      let out = {
        language: null,
        style_hints: [],
        audience_notes: [],
        sensitivities: [],
        updated_at: new Date().toISOString(),
      };
      try {
        const { sample } = await import('./dist/src/mcp/sampling.js').catch(
          async () => await import('./src/mcp/sampling.js'),
        );
        const resp = await sample({ prompt, maxTokens: 384 });
        const raw = resp.text || '';
        const lang = (raw.match(/LANG:\s*(.+)/i) || [])[1]?.trim();
        const sec = (name) =>
          raw
            .split(new RegExp(`\n${name}:\n`, 'i'))[1]
            ?.split(/\n[A-Z]+:/)[0] || '';
        const bullets = (s) =>
          Array.from(s.matchAll(/^-\s+(.+)$/gim)).map((m) => m[1].trim());
        out.language = lang || null;
        out.style_hints = bullets(sec('STYLE'));
        out.audience_notes = bullets(sec('AUDIENCE'));
        out.sensitivities = bullets(sec('SENSITIVITIES'));
      } catch {}
      const saved = {
        ...out,
        room_id,
        updated_at: new Date().toISOString(),
        _ts: Date.now(),
      };
      briefCache.set(room_id, saved);
      return { content: [{ type: 'json', json: saved }] };
    }),
  );

  // --- Draft replies tailored by brief ---
  srv.tool(
    'draft_replies',
    z.object({
      room_id: z.string(),
      source: z.object({
        text: z.string().optional(),
        event_id: z.string().optional(),
      }),
      intention: z.string().default('inform'),
      extra_instructions: z.string().optional(),
      tone: z.string().optional(),
      language: z.string().optional(),
      to: z.string().optional(),
    }),
    authWrapper(
      async ({
        room_id,
        source,
        intention,
        extra_instructions,
        tone,
        language,
        to: _to,
      }) => {
        // reference optional parameter to avoid lint unused warning
        void _to;
        let context = '';
        if (source?.text) context = source.text;
        else if (source?.event_id && logDb) {
          const row = logDb
            .prepare('SELECT line FROM logs WHERE event_id = ?')
            .get(source.event_id);
          context = row?.line || '';
        }
        const briefRes = await srv
          .callTool('brief_room', { room_id })
          .catch(() => null);
        const brief = briefRes?.content?.[0]?.json || {};
        const lang =
          language || brief.language || 'the same language as the context';
        const style = (brief.style_hints || []).map((s) => `- ${s}`).join('\n');
        const sys = `Write two alternative replies in ${lang} with a ${tone || 'friendly'} tone.\nKeep each under 80 words. Use a relaxed, friendly voice. Light emojis are OK if it fits (optional). Be specific and helpful.\nStyle hints:\n${style}`;
        const prompt = `${sys}\nIntention: ${intention}\nConstraints/Extras: ${extra_instructions || 'none'}\nContext:\n${context}\n\nReturn as:\n1) <reply>\n2) <reply>\n`;
        let text = '';
        try {
          const { sample } = await import('./dist/src/mcp/sampling.js').catch(
            async () => await import('./src/mcp/sampling.js'),
          );
          const resp = await sample({ prompt, maxTokens: 256 });
          text = resp.text || '';
        } catch {}
        return {
          content: [
            {
              type: 'json',
              json: { drafts: text.split(/\n\s*\n/).slice(0, 2) },
            },
          ],
        };
      },
    ),
  );

  // --- Revise reply (iterate with extra instructions) ---
  srv.tool(
    'revise_reply',
    z.object({
      room_id: z.string(),
      base_draft: z.string(),
      extra_instructions: z.string(),
    }),
    authWrapper(async ({ room_id, base_draft, extra_instructions }) => {
      const briefRes = await srv
        .callTool('brief_room', { room_id })
        .catch(() => null);
      const brief = briefRes?.content?.[0]?.json || {};
      const lang = brief.language || 'the same language as the context';
      const style = (brief.style_hints || []).map((s) => `- ${s}`).join('\n');
      const prompt = `Revise the reply below in ${lang}, respecting these style hints. Keep under 80 words. Provide two alternatives.\nStyle:\n${style}\nExtra instructions: ${extra_instructions}\n\nBASE:\n${base_draft}\n\nReturn as:\n1) <reply>\n2) <reply>\n`;
      let text = '';
      try {
        const { sample } = await import('./dist/src/mcp/sampling.js').catch(
          async () => await import('./src/mcp/sampling.js'),
        );
        const resp = await sample({ prompt, maxTokens: 200 });
        text = resp.text || '';
      } catch {}
      return {
        content: [
          { type: 'json', json: { drafts: text.split(/\n\s*\n/).slice(0, 2) } },
        ],
      };
    }),
  );

  // --- QA over recent history (SQLite) ---
  srv.tool(
    'qa',
    z.object({
      question: z.string(),
      rooms: z.array(z.string()).optional(),
      limit: z.number().int().positive().default(3),
    }),
    authWrapper(async ({ question, rooms, limit }) => {
      const highlights = [];
      let ctx = '';
      if (logDb) {
        const rs =
          rooms && rooms.length
            ? rooms
            : logDb
                .prepare('SELECT DISTINCT room_id FROM logs ORDER BY room_id')
                .all()
                .map((r) => r.room_id);
        const kw = String(question).toLowerCase().split(/\W+/).filter(Boolean);
        for (const roomId of rs) {
          const rows = logDb
            .prepare(
              'SELECT ts, line, event_id FROM logs WHERE room_id = ? ORDER BY ts DESC LIMIT 400',
            )
            .all(roomId);
          for (const r of rows) {
            const line = String(r.line || '');
            const t = line.toLowerCase();
            if (kw.some((w) => t.includes(w))) {
              highlights.push({
                room_id: roomId,
                uri: `im://matrix/room/${roomId}/message/${r.event_id || ''}/context`,
                snippet: line,
              });
              ctx += `${line}\n`;
              if (highlights.length >= limit) break;
            }
          }
          if (highlights.length >= limit) break;
        }
      }
      const prompt = `Answer the question strictly from the context. If unknown, say "not found in recent history".\nQuestion: ${question}\nContext:\n${ctx}`;
      let answer = '';
      try {
        const { sample } = await import('./dist/src/mcp/sampling.js').catch(
          async () => await import('./src/mcp/sampling.js'),
        );
        const resp = await sample({ prompt, maxTokens: 220 });
        answer = resp.text || '';
      } catch {}
      return { content: [{ type: 'json', json: { answer, highlights } }] };
    }),
  );

  // --- Digest: daily markdown summary ---
  srv.tool(
    'digest_generate',
    z.object({
      rooms: z.array(z.string()).optional(),
      hours: z.number().int().positive().default(24),
    }),
    authWrapper(async ({ rooms, hours }) => {
      const os = await import('os');
      const path = await import('path');
      const fs = await import('fs');
      const home =
        process.env.BEEPERMCP_HOME || path.join(os.homedir(), '.BeeperMCP');
      const outDir = path.join(home, 'digests');
      let linesByRoom = {};
      let roomList = rooms && rooms.length ? rooms : [];
      if (logDb) {
        if (!roomList.length) {
          roomList = logDb
            .prepare('SELECT DISTINCT room_id FROM logs ORDER BY room_id')
            .all()
            .map((r) => r.room_id);
        }
        const since = new Date(Date.now() - hours * 3600_000).toISOString();
        for (const roomId of roomList) {
          const rows = logDb
            .prepare(
              'SELECT ts, line FROM logs WHERE room_id = ? AND ts >= ? ORDER BY ts ASC LIMIT 800',
            )
            .all(roomId, since);
          linesByRoom[roomId] = rows.map((r) => r.line);
        }
      }
      const stats = Object.entries(linesByRoom)
        .map(([roomId, lines]) => `${roomId}: ${lines.length} lines`)
        .join('\n');
      const prompt = `Write a concise daily digest for the last ${hours}h across these rooms. Include top topics (3 bullets), 3 key quotes (short), 3-5 action items, and 1-3 risks. Keep under 1600 characters.\nRooms & line counts:\n${stats}`;
      let markdown = '';
      try {
        const { sample } = await import('./dist/src/mcp/sampling.js').catch(
          async () => await import('./src/mcp/sampling.js'),
        );
        const resp = await sample({ prompt, maxTokens: 500 });
        markdown = resp.text || '';
      } catch {}
      fs.mkdirSync(outDir, { recursive: true });
      const file = path.join(
        outDir,
        `${new Date().toISOString().slice(0, 10)}.md`,
      );
      try {
        fs.writeFileSync(file, `# Digest (last ${hours}h)\n\n${markdown}\n`, {
          mode: 0o600,
        });
      } catch {}
      return {
        content: [
          {
            type: 'json',
            json: {
              file_uri: file,
              markdown,
              preview: markdown.slice(0, 1000),
            },
          },
        ],
      };
    }),
  );

  // --- Translate text to target language ---
  srv.tool(
    'translate_text',
    z.object({ text: z.string(), target_language: z.string().optional() }),
    authWrapper(async ({ text, target_language }) => {
      const target = target_language || 'en';
      const prompt = `Translate the following text into ${target}. Keep names, code, and URLs intact.\n\nTEXT:\n${text}`;
      let out = '';
      try {
        const { sample } = await import('./dist/src/mcp/sampling.js').catch(
          async () => await import('./src/mcp/sampling.js'),
        );
        const resp = await sample({ prompt, maxTokens: 400 });
        out = resp.text || '';
      } catch {}
      return {
        content: [
          {
            type: 'json',
            json: { translated_text: out, target_language: target },
          },
        ],
      };
    }),
  );

  const wrapHandler = (method) => {
    const orig = srv.server._requestHandlers.get(method);
    srv.server._requestHandlers.set(method, (req, extra) => {
      const scope = method.startsWith('resources') ? 'resources' : 'tools';
      if (!isAllowed(extra?._meta?.apiKey, scope))
        throw new Error('Invalid API key');
      return orig(req, extra);
    });
  };
  wrapHandler('tools/list');
  wrapHandler('tools/call');
  wrapHandler('resources/list');

  // --- Tone: learn from user's own messages ---
  srv.tool(
    'tone_learn',
    z.object({
      aliases: z.array(z.string()),
      since_days: z.number().int().positive().optional(),
      per_person_max: z.number().int().positive().optional(),
    }),
    authWrapper(async ({ aliases, since_days, per_person_max }) => {
      try {
        const eng = await import('./dist/src/style/engine.js').catch(
          async () => await import('./src/style/engine.js'),
        );
        const map =
          eng.learnPersonalTone?.(aliases, {
            sinceDays: since_days,
            perPersonMax: per_person_max,
          }) || {};
        const count = Object.keys(map).length;
        return { content: [{ type: 'json', json: { profiles: map, count } }] };
      } catch (e) {
        return {
          content: [{ type: 'json', json: { profiles: {}, error: String(e) } }],
        };
      }
    }),
  );

  // --- Tone: get profile for a person ---
  srv.tool(
    'tone_get',
    z.object({ person_id: z.string() }),
    authWrapper(async ({ person_id }) => {
      try {
        const eng = await import('./dist/src/style/engine.js').catch(
          async () => await import('./src/style/engine.js'),
        );
        const prof = eng.getPersonalHints?.(person_id) || null;
        return { content: [{ type: 'json', json: { profile: prof } }] };
      } catch (e) {
        return {
          content: [
            { type: 'json', json: { profile: null, error: String(e) } },
          ],
        };
      }
    }),
  );
  wrapHandler('resources/read');

  return srv;
}
