/*
  NOTE: To make further edits here I can also modify other project files —
  please add any files you want me to edit to the chat.

  Based on the current checklist, please add these files if you want me to
  apply the remaining fixes and wiring (recommended):

  - package.json                       (fix duplicate object, scripts, add pg)
  - tsconfig.json                      (switch to single NodeNext project)
  - src/config.ts                      (resolve Config name collisions, fix types)
  - src/ingest/matrix.ts               (remove unused imports / implement ingest)
  - utils.js                           (log DB access used by resources)
  - mcp-tools.js                       (MCP tool wiring)
  - src/mcp/resources.ts               (wire history resource to SQLite logs)
  - src/mcp.ts                         (ensure resources() is called with logDb/logSecret)
  - src/mcp/tools/sentimentTrends.ts   (fix subjectivity column + add filters)
  - src/mcp/tools/sentimentDistribution.ts (add filters for target/lang/types)
  - src/mcp/tools/whoSaid.ts           (add participants/lang filters, safe regex)
  - src/mcp/tools/activity.ts          (support participant target + types)
  - src/index/reembed.ts               (re-embed batch is present; include if changes needed)
  - src/index/search.ts                (search filters already present; include if modifying)
  - any other src/mcp/tools/*.ts you want adjusted (e.g. sendMessage, recap)

  If you add those files to the chat I will produce exact SEARCH/REPLACE blocks
  to apply the minimal edits required. If you prefer I can also create a short
  prioritized patch list — tell me which files you want me to edit first.
*/
import { config } from "../config.js";
import { capabilities } from "./capabilities.js";
import { registerResources, handleResource } from "./resources.js";
import * as searchTool from "./tools/search.js";
import * as whoSaidTool from "./tools/whoSaid.js";
import * as recapTool from "./tools/recap.js";
import * as openLoopsTool from "./tools/openLoops.js";
import * as responseTimeTool from "./tools/responseTime.js";
import * as activityTool from "./tools/activity.js";
import * as sentimentTrendsTool from "./tools/sentimentTrends.js";
import * as sentimentDistributionTool from "./tools/sentimentDistribution.js";
import * as draftReplyTool from "./tools/draftReply.js";
import * as sendMessageTool from "./tools/sendMessage.js";

// Placeholder HTTP-SSE transport wiring
import http from "node:http";
import { URL } from "node:url";

registerResources();

const tools = new Map<string, (input: any) => Promise<any>>([
  [searchTool.id, searchTool.handler],
  [whoSaidTool.id, whoSaidTool.handler],
  [recapTool.id, recapTool.handler],
  [openLoopsTool.id, openLoopsTool.handler],
  [responseTimeTool.id, responseTimeTool.handler],
  [activityTool.id, activityTool.handler],
  [sentimentTrendsTool.id, sentimentTrendsTool.handler],
  [sentimentDistributionTool.id, sentimentDistributionTool.handler],
  [draftReplyTool.id, draftReplyTool.handler],
  [sendMessageTool.id, sendMessageTool.handler]
]);

const server = http.createServer(async (req, res) => {
  try {
    if (!req.url) {
      res.statusCode = 400;
      return res.end("bad request");
    }
    const u = new URL(req.url, config.mcp.baseUrl);
    if (u.pathname === "/capabilities") {
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify(capabilities()));
    }
    if (u.pathname === "/resource") {
      const uri = u.searchParams.get("uri");
      if (!uri) {
        res.statusCode = 400;
        return res.end("missing uri");
      }
      const data = await handleResource(uri, u.searchParams);
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify(data));
    }
    if (u.pathname === "/tool") {
      if (req.method !== "POST") {
        res.statusCode = 405;
        return res.end("method not allowed");
      }
      let body = "";
      for await (const chunk of req) body += chunk.toString("utf8");
      const payload = JSON.parse(body);
      const fn = tools.get(payload.id);
      if (!fn) {
        res.statusCode = 404;
        return res.end("tool not found");
      }
      const out = await fn(payload.input ?? {});
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify(out));
    }
    res.statusCode = 404;
    res.end("not found");
  } catch (err: any) {
    res.statusCode = 500;
    res.end(`error:${err?.message ?? String(err)}`);
  }
});

if (process.env.NODE_ENV !== "test") {
  const port = Number(new URL(config.mcp.baseUrl).port || 8757);
  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`MCP HTTP server listening on ${config.mcp.baseUrl}`);
  });
}
