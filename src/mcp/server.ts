/*
  NOTE: This MCP HTTP server requires several other project files to be present
  to build and operate. Please add the following files (if not already added):

  Required to build & run:
  - package.json
  - tsconfig.json
  - src/config.ts
  - utils.js
  - mcp-tools.js

  MCP resources & analytics (needed to wire tools/resources):
  - src/mcp/resources.ts
  - src/index/search.ts
  - src/index/reembed.ts
  - src/mcp/tools/sentimentTrends.ts
  - src/mcp/tools/sentimentDistribution.ts
  - src/mcp/tools/whoSaid.ts
  - src/mcp/tools/activity.ts
  - (optional) other src/mcp/tools/*.ts (recap, responseTime, draftReply, sendMessage)

  Ingest & DB:
  - src/ingest/matrix.ts (to persist messages into Postgres)
  - Postgres messages schema (CREATE TABLE)

  Additional files often required by runtime wiring (please add these if you
  plan to exercise crypto/decryption, auth, or event logging):
  - src/auth.js (or src/auth.ts)                 // token/password verification helpers
  - src/crypto.js (or src/crypto.ts)             // Olm / rust-crypto init & helpers
  - src/decryption-manager.js                    // decryption manager used by event-logger
  - src/event-logger.ts                          // event logging wiring (exists in repo)
  - src/client.ts / src/matrix/client.ts         // matrix helper clients
  - Any other src/mcp/tools/*.ts you expect to extend

  After you add the missing files, I'll apply focused SEARCH/REPLACE patches
  to finish wiring resources, parameterized queries and analytics behavior.

  // Suggested additional files (if not already added):
  // - src/config.ts
  // - utils.js
  // - mcp-tools.js
  // These are commonly required to build/run the MCP server and to enable
  // full resource/tool wiring and tests.
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

/*
  Helper: list files that are typically required to build & run the MCP server.
  Useful when triaging missing files to add to the chat/repo.
*/
export const requiredFiles = [
  "package.json",
  "tsconfig.json",
  "src/config.ts",
  "utils.js",
  "mcp-tools.js",
  "src/mcp/resources.ts",
  "src/index/search.ts",
  "src/index/reembed.ts",
  "src/mcp/tools/sentimentTrends.ts",
  "src/mcp/tools/sentimentDistribution.ts",
  "src/mcp/tools/whoSaid.ts",
  "src/mcp/tools/activity.ts",
  "src/mcp/tools/recap.ts",
  "src/mcp/tools/responseTime.ts",
  "src/mcp/tools/draftReply.ts",
  "src/mcp/tools/sendMessage.ts",
  "src/ingest/matrix.ts",
  "Postgres: messages schema (CREATE TABLE messages ...)",
  "Optional: scripts/migrate.ts",
  // Suggested additional files to add to the chat if you want me to patch them:
  "src/auth.js (or src/auth.ts)",
  "src/crypto.js (or src/crypto.ts)",
  "src/decryption-manager.js",
  "src/event-logger.ts",
  "src/client.ts",
  "src/matrix/client.ts"
];

 // Placeholder HTTP-SSE transport wiring
import http from "node:http";
import { URL } from "node:url";

// Register resources. If you have a SQLite log DB, pass it as the first arg.
// The second argument is the optional log decryption secret (config.logSecret).
// Leaving the DB undefined keeps the lightweight stub behavior.
registerResources(undefined, config.logSecret);

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
