import { indexStatus } from '../index/status.js';
import { queryLogs } from '../../utils.js';

export type ResourceHandler = (
  pathParams: Record<string, string>,
  query: URLSearchParams,
  owner: string,
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
    const limit = Math.max(1, Math.min(500, Number(query.get('limit') ?? 100)));
    const cursor = query.get('cursor') ?? undefined; // ISO ts cursor
    const dir = (query.get('dir') || 'next').toLowerCase(); // next|prev
    const lang = query.get('lang') ?? undefined;
    if (!logDbRef)
      return {
        roomId,
        from,
        to,
        limit,
        lang,
        cursorIn: cursor,
        nextCursor: undefined,
        prevCursor: undefined,
        items: [],
      };
    if (!cursor && !from && !to) {
      // Initial page: earliest `limit` rows by ts ASC (forward pagination)
      const rows = logDbRef
        .prepare(
          'SELECT ts, line FROM logs WHERE room_id = ? ORDER BY ts ASC LIMIT ?',
        )
        .all(roomId, limit) as any[];
      const lines = rows.map((r) => r.line);
      const firstTs = rows.length ? rows[0].ts : undefined; // oldest among selection
      const lastTs = rows.length ? rows[rows.length - 1].ts : undefined; // newest among selection
      let prevCursor: string | undefined;
      let nextCursor: string | undefined;
      if (firstTs) {
        const c = logDbRef
          .prepare('SELECT 1 FROM logs WHERE room_id = ? AND ts < ? LIMIT 1')
          .get(roomId, firstTs);
        if (c) prevCursor = firstTs;
      }
      if (lastTs) {
        const c = logDbRef
          .prepare('SELECT 1 FROM logs WHERE room_id = ? AND ts > ? LIMIT 1')
          .get(roomId, lastTs);
        if (c) nextCursor = lastTs;
      }
      return {
        roomId,
        from,
        to,
        limit,
        lang,
        cursorIn: undefined,
        nextCursor,
        prevCursor,
        items: lines,
      };
    }
    if (cursor) {
      if (dir === 'prev') {
        const desc = logDbRef
          .prepare(
            'SELECT ts, line FROM logs WHERE room_id = ? AND ts < ? ORDER BY ts DESC LIMIT ?',
          )
          .all(roomId, cursor, limit) as any[];
        const reversed = desc.reverse();
        const lines = reversed.map((r) => r.line);
        const firstTs = reversed.length ? reversed[0].ts : undefined;
        const lastTs = reversed.length
          ? reversed[reversed.length - 1].ts
          : undefined;
        let prevCursor: string | undefined;
        let nextCursor: string | undefined;
        if (firstTs) {
          const c = logDbRef
            .prepare('SELECT 1 FROM logs WHERE room_id = ? AND ts < ? LIMIT 1')
            .get(roomId, firstTs);
          if (c) prevCursor = firstTs;
        }
        if (lastTs) {
          const c = logDbRef
            .prepare('SELECT 1 FROM logs WHERE room_id = ? AND ts > ? LIMIT 1')
            .get(roomId, lastTs);
          if (c) nextCursor = lastTs;
        }
        return {
          roomId,
          from,
          to,
          limit,
          lang,
          cursorIn: cursor,
          nextCursor,
          prevCursor,
          items: lines,
        };
      } else {
        const rows = logDbRef
          .prepare(
            'SELECT ts, line FROM logs WHERE room_id = ? AND ts > ? ORDER BY ts ASC LIMIT ?',
          )
          .all(roomId, cursor, limit) as any[];
        const lines = rows.map((r) => r.line);
        const firstTs = rows.length ? rows[0].ts : undefined;
        const lastTs = rows.length ? rows[rows.length - 1].ts : undefined;
        let prevCursor: string | undefined;
        let nextCursor: string | undefined;
        if (firstTs) {
          const c = logDbRef
            .prepare('SELECT 1 FROM logs WHERE room_id = ? AND ts < ? LIMIT 1')
            .get(roomId, firstTs);
          if (c) prevCursor = firstTs;
        }
        if (lastTs) {
          const c = logDbRef
            .prepare('SELECT 1 FROM logs WHERE room_id = ? AND ts > ? LIMIT 1')
            .get(roomId, lastTs);
          if (c) nextCursor = lastTs;
        }
        return {
          roomId,
          from,
          to,
          limit,
          lang,
          cursorIn: cursor,
          nextCursor,
          prevCursor,
          items: lines,
        };
      }
    }
    const out = queryLogs(logDbRef, roomId, limit, from, to, logSecretRef);
    const firstTs = logDbRef
      .prepare(
        'SELECT ts FROM logs WHERE room_id = ? AND (? IS NULL OR ts >= ?) AND (? IS NULL OR ts <= ?) ORDER BY ts ASC LIMIT 1',
      )
      .get(roomId, from, from, to, to)?.ts;
    const lastTs = logDbRef
      .prepare(
        'SELECT ts FROM logs WHERE room_id = ? AND (? IS NULL OR ts >= ?) AND (? IS NULL OR ts <= ?) ORDER BY ts DESC LIMIT 1',
      )
      .get(roomId, from, from, to, to)?.ts;
    let prevCursor: string | undefined;
    let nextCursor: string | undefined;
    if (firstTs) {
      const c = logDbRef
        .prepare('SELECT 1 FROM logs WHERE room_id = ? AND ts < ? LIMIT 1')
        .get(roomId, firstTs);
      if (c) prevCursor = firstTs;
    }
    if (lastTs) {
      const c = logDbRef
        .prepare('SELECT 1 FROM logs WHERE room_id = ? AND ts > ? LIMIT 1')
        .get(roomId, lastTs);
      if (c) nextCursor = lastTs;
    }
    return {
      roomId,
      from,
      to,
      limit,
      lang,
      cursorIn: cursor,
      nextCursor,
      prevCursor,
      items: out,
    };
  });

  addResource(
    'im://matrix/room/:roomId/message/:eventId/context',
    async (params, query) => {
      const before = Number(query.get('before') ?? 5);
      const after = Number(query.get('after') ?? 5);
      if (!logDbRef)
        return {
          roomId: params.roomId,
          eventId: params.eventId,
          before,
          after,
          items: [],
        };
      // Look up anchor timestamp by event_id
      const row = logDbRef
        .prepare('SELECT ts FROM logs WHERE event_id = ? LIMIT 1')
        .get(params.eventId);
      const anchor = row?.ts as string | undefined;
      if (!anchor)
        return {
          roomId: params.roomId,
          eventId: params.eventId,
          before,
          after,
          items: [],
        };
      let since: string | undefined;
      let until: string | undefined;
      if (before > 0) {
        const br = logDbRef
          .prepare(
            'SELECT ts FROM logs WHERE room_id = ? AND ts < ? ORDER BY ts DESC LIMIT 1 OFFSET ?',
          )
          .get(params.roomId, anchor, before - 1);
        since = br?.ts;
      } else {
        since = anchor;
      }
      if (after > 0) {
        const ar = logDbRef
          .prepare(
            'SELECT ts FROM logs WHERE room_id = ? AND ts > ? ORDER BY ts ASC LIMIT 1 OFFSET ?',
          )
          .get(params.roomId, anchor, after - 1);
        until = ar?.ts;
      } else {
        until = anchor;
      }
      const items = queryLogs(
        logDbRef,
        params.roomId,
        before + after + 1,
        since,
        until,
        logSecretRef,
      );
      return {
        roomId: params.roomId,
        eventId: params.eventId,
        before,
        after,
        items,
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

  addResource('im://matrix/index/status', async (_params, _query, owner) => {
    return indexStatus(owner);
  });
}

export function listResources(): string[] {
  return routes.map((r) => r.template);
}

export async function handleResource(
  uri: string,
  query: URLSearchParams,
  owner: string,
) {
  for (const r of routes) {
    const m = uri.match(r.pattern);
    if (m) {
      const params: Record<string, string> = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      return r.handler(params, query, owner);
    }
  }
  throw new Error(`Resource not found: ${uri}`);
}
