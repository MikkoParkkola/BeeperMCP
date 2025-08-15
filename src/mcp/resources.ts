import { indexStatus } from "../index/status.js";
import { queryLogs, openLogDb } from "../../utils.js";

export type ResourceHandler = (pathParams: Record<string, string>, query: URLSearchParams) => Promise<any>;

const routes: { template: string; pattern: RegExp; keys: string[]; handler: ResourceHandler }[] = [];
let registered = false;
let logDbRef: any | undefined;
let logSecretRef: string | undefined;

function addResource(template: string, handler: ResourceHandler) {
  const keys: string[] = [];
  const regex = new RegExp(
    "^" +
      template
        .replace(/\//g, "\\/")
        .replace(/:\w+/g, (m) => {
          keys.push(m.slice(1));
          return "([^/]+)";
        }) +
      "$",
  );
  routes.push({ template, pattern: regex, keys, handler });
}

export function registerResources(logDb?: any, logSecret?: string) {
  if (registered) return;
  registered = true;
  logDbRef = logDb;
  logSecretRef = logSecret;
  addResource("im://matrix/room/:roomId/history", async (params, query) => {
    const roomId = params.roomId;
    const from = query.get("from") ?? undefined;
    const to = query.get("to") ?? undefined;
    const limit = Number(query.get("limit") ?? 100);
    const lang = query.get("lang") ?? undefined;
    if (!logDbRef) return { roomId, from, to, limit, lang, items: [] };
    const items = queryLogs(logDbRef, roomId, limit, from, to, logSecretRef);
    return { roomId, from, to, limit, lang, items };
  });

  addResource("im://matrix/room/:roomId/message/:eventId/context", async (params, query) => {
    const before = Number(query.get("before") ?? 5);
    const after = Number(query.get("after") ?? 5);
    if (!logDbRef) return { roomId: params.roomId, eventId: params.eventId, before, after, items: [] };
    // Look up anchor timestamp by event_id
    const row = logDbRef
      .prepare("SELECT ts FROM logs WHERE event_id = ? LIMIT 1")
      .get(params.eventId);
    const anchor = row?.ts as string | undefined;
    if (!anchor) return { roomId: params.roomId, eventId: params.eventId, before, after, items: [] };
    const items = queryLogs(
      logDbRef,
      params.roomId,
      before + after + 1,
      undefined,
      undefined,
      logSecretRef,
    );
    // If we fetched broad logs, slice a window around anchor
    const idx = items.findIndex((l: string) => l.includes(params.eventId));
    if (idx === -1) return { roomId: params.roomId, eventId: params.eventId, before, after, items: [] };
    const start = Math.max(0, idx - before);
    const end = Math.min(items.length, idx + after + 1);
    return { roomId: params.roomId, eventId: params.eventId, before, after, items: items.slice(start, end) };
  });

  addResource("im://matrix/media/:eventId/:kind", async (params) => {
    if (!logDbRef) return { eventId: params.eventId, kind: params["kind"] };
    const row = logDbRef
      .prepare(
        "SELECT event_id as eventId, room_id as roomId, ts, file, type, size, hash FROM media WHERE event_id = ?",
      )
      .get(params.eventId);
    return row ?? { eventId: params.eventId, kind: params["kind"] };
  });

  addResource("im://matrix/index/status", async () => {
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
