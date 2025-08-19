import { indexStatus } from '../index/status.js';
import * as U from '../../utils.js';

export type ResourceHandler = (
  pathParams: Record<string, string>,
  query: URLSearchParams,
) => Promise<any>;

const routes: {
  template: string;
  pattern: RegExp;
  keys: string[];
  handler: ResourceHandler;
}[] = [];
let registered = false;
let logDbRef: any | undefined;
let logSecretRef: string | undefined;

function addResource(template: string, handler: ResourceHandler) {
  const keys: string[] = [];
  const regex = new RegExp(
    '^' +
      template.replace(/\//g, '\\/').replace(/:\w+/g, (m) => {
        keys.push(m.slice(1));
        return '([^/]+)';
      }) +
      '$',
  );
  routes.push({ template, pattern: regex, keys, handler });
}

export function registerResources(logDb?: any, logSecret?: string) {
  // Always update DB/secret references so tests or callers can rebind.
  logDbRef = logDb;
  logSecretRef = logSecret;
  if (registered) return;
  registered = true;
  addResource('im://matrix/room/:roomId/history', async (params, query) => {
    const roomId = params.roomId;
    const from = query.get('from') ?? undefined;
    const to = query.get('to') ?? undefined;
    const limit = Number(query.get('limit') ?? 100);
    const lang = query.get('lang') ?? undefined;
    if (!logDbRef) return { roomId, from, to, limit, lang, items: [] };
    const items = U.queryLogs(logDbRef, roomId, limit, from, to, logSecretRef);
    return { roomId, from, to, limit, lang, items };
  });

  addResource(
    'im://matrix/room/:roomId/message/:eventId/context',
    async (params, query) => {
      const before = Number(query.get('before') ?? 5);
      const after = Number(query.get('after') ?? 5);
      const cursor = query.get('cursor') ?? undefined; // optional eventId cursor
      const dir = query.get('dir') ?? undefined; // 'prev' | 'next'
      if (!logDbRef)
        return {
          roomId: params.roomId,
          eventId: params.eventId,
          before,
          after,
          items: [],
        };
      // Determine anchor event: either the requested eventId or a cursor +/- one entry
      let anchor = logDbRef
        .prepare('SELECT ts, event_id, line, room_id FROM logs WHERE event_id = ? LIMIT 1')
        .get(cursor || params.eventId);
      if (anchor && dir === 'prev') {
        const prev = logDbRef
          .prepare(
            'SELECT ts, event_id, line, room_id FROM logs WHERE room_id = ? AND ts < ? ORDER BY ts DESC LIMIT 1',
          )
          .get(params.roomId, anchor.ts);
        if (prev) anchor = prev;
      } else if (anchor && dir === 'next') {
        const nxt = logDbRef
          .prepare(
            'SELECT ts, event_id, line, room_id FROM logs WHERE room_id = ? AND ts > ? ORDER BY ts ASC LIMIT 1',
          )
          .get(params.roomId, anchor.ts);
        if (nxt) anchor = nxt;
      }
      if (!anchor)
        return {
          roomId: params.roomId,
          eventId: params.eventId,
          before,
          after,
          items: [],
        };
      // Fetch rows before and after based on timestamp
      const prevRows = logDbRef
        .prepare(
          'SELECT ts, event_id, line FROM logs WHERE room_id = ? AND ts < ? ORDER BY ts DESC LIMIT ?',
        )
        .all(params.roomId, anchor.ts, before)
        .reverse();
      const nextRows = logDbRef
        .prepare(
          'SELECT ts, event_id, line FROM logs WHERE room_id = ? AND ts > ? ORDER BY ts ASC LIMIT ?',
        )
        .all(params.roomId, anchor.ts, after);
      const maybeDec = (l: string) => {
        if (!logSecretRef) return l;
        try {
          return (U as any).decryptLine ? (U as any).decryptLine(l, logSecretRef) : l;
        } catch {
          return l; // on failure, return as-is rather than dropping context
        }
      };
      const items = [
        ...prevRows.map((r: any) => ({ ts: r.ts, eventId: r.event_id, line: maybeDec(r.line) })),
        { ts: anchor.ts, eventId: anchor.event_id, line: maybeDec(anchor.line) },
        ...nextRows.map((r: any) => ({ ts: r.ts, eventId: r.event_id, line: maybeDec(r.line) })),
      ];
      const prev_cursor = prevRows.length ? prevRows[prevRows.length - 1].event_id : null;
      const next_cursor = nextRows.length ? nextRows[0].event_id : null;
      return {
        roomId: params.roomId,
        eventId: params.eventId,
        before,
        after,
        items,
        prev_cursor,
        next_cursor,
      };
    },
  );

  addResource('im://matrix/media/:eventId/:kind', async (params) => {
    if (!logDbRef) return { eventId: params.eventId, kind: params['kind'] };
    const row = logDbRef
      .prepare(
        'SELECT event_id as eventId, room_id as roomId, ts, file, type, size, hash FROM media WHERE event_id = ?',
      )
      .get(params.eventId);
    return row ?? { eventId: params.eventId, kind: params['kind'] };
  });

  addResource('im://matrix/index/status', async () => {
    return indexStatus();
  });
}

export function listResources(): string[] {
  return routes.map((r) => r.template);
}

export async function handleResource(uri: string, query: URLSearchParams) {
  for (const r of routes) {
    const m = uri.match(r.pattern);
    if (m) {
      const params: Record<string, string> = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      return r.handler(params, query);
    }
  }
  throw new Error(`Resource not found: ${uri}`);
}

export function matchResourceTemplate(uri: string): string | null {
  for (const r of routes) {
    if (r.pattern.test(uri)) return r.template;
  }
  return null;
}
