import { indexStatus } from "../index/status.js";

export type ResourceHandler = (pathParams: Record<string, string>, query: URLSearchParams) => Promise<any>;

const routes: { template: string; pattern: RegExp; keys: string[]; handler: ResourceHandler }[] = [];
let registered = false;

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

export function registerResources() {
  if (registered) return;
  registered = true;
  addResource("im://matrix/room/:roomId/history", async (params, query) => {
    const roomId = params.roomId;
    const from = query.get("from") ?? undefined;
    const to = query.get("to") ?? undefined;
    const limit = Number(query.get("limit") ?? 100);
    const lang = query.get("lang") ?? undefined;
    return { roomId, from, to, limit, lang, items: [] };
  });

  addResource("im://matrix/room/:roomId/message/:eventId/context", async (params, query) => {
    const before = Number(query.get("before") ?? 5);
    const after = Number(query.get("after") ?? 5);
    return { roomId: params.roomId, eventId: params.eventId, before, after, items: [] };
  });

  addResource("im://matrix/media/:eventId/:kind", async (params) => {
    return { eventId: params.eventId, kind: params["kind"] };
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
