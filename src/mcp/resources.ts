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
    const limit = Number(query.get('limit') ?? 100);
    const lang = query.get('lang') ?? undefined;
    if (!logDbRef) return { roomId, from, to, limit, lang, items: [] };
    const items = queryLogs(logDbRef, roomId, limit, from, to, logSecretRef);
    return { roomId, from, to, limit, lang, items };
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
