# Project status and roadmap (for agents and contributors)

Purpose

- This document summarizes the current state of the codebase and the prioritized TODOs to reach a high‑quality release, both for local use and future cloud hosting.

How We Work (Agent Guide)

- Build and test flow:
  - Use `npm ci && npm run build` before running tests.
  - Run all tests via `npm test` or `npm run test:coverage` (compiles TS to `dist/` and runs Node test runner).
- Versioning:
  - Bump at least the minor `package.json` version for any behavioral change; major versions for breaking changes.
  - Update the `releaseDate` field (YYYY-MM-DD) whenever the version changes.
- MCP surface:
  - Prefer the Streamable HTTP MCP server initialized in `src/mcp.ts`. Avoid duplicating tool/resource wiring elsewhere.
  - Resources are registered via `registerResources(logDb, logSecret)` and backed by SQLite (`utils.js`).
- TDD hooks for Postgres tools and send pipeline:
  - `src/mcp/tools/*`: modules export `__setTestPool(p)` to inject a fake PG pool in tests (avoid real DB).
  - `src/mcp/tools/sendMessage.ts` exports `__setSendFn(fn)` to stub Matrix send in tests.
  - `src/security/rateLimit.ts` exports `__resetRateLimiter(name?)` to reset token buckets between tests.
- Config:
  - Local server uses `loadConfig()`; analytics tools use `config` constants. Do not mix the two shapes.
  - Defaults: `config.mcp.rateLimits.send=3`. Adjust in CI via env if needed.
- Principles:
  - Push filters/aggregations to SQL. Avoid client-side loops over large sets.
  - Keep API key enforcement consistent across MCP tools and resources.
  - Tests first where feasible; add minimal injection points instead of heavyweight mocks.

Definition of Done

- Implement features using test-driven development (write failing tests first).
- Update unit, integration, and end-to-end test automation.
- Maintain test automation coverage above 80% with a 95% target.
- Ensure all CI tests pass and local test automation succeeds.
- Update AGENTS.md with feature descriptions, architecture notes, style guides, and coding conventions.
- Keep troubleshooting instructions and debug logging current.
- Document code and remove dead code.
- Ensure dashboards and statistics are up to date.
- Complete security review and implement recommendations.
- Complete architecture review and implement recommendations.
- Complete performance review and implement recommendations.
- Complete UX review and implement recommendations.
- Complete legal review (IPRs/GDPR/License) and implement recommendations.
- Catch and log errors, handle recovery, and implement failbacks.
- Obtain explicit user approval for breaking changes or dropped functionality.
- For each PR that alters the functionality, bump the version number. For smaller changes, at least the minor version number; for really big changes, the major number.

Architecture snapshot

- Surfaces
  - MCP server (HTTP, streamable) is initialized in src/mcp.ts using buildMcpServer from mcp-tools.js.
    - Tools in mcp-tools.js: list_rooms, create_room, list_messages, send_message (optional).
    - Resources (resources/list, resources/read) are gated by API key in src/mcp.ts and delegated to src/mcp/resources.ts.
  - Postgres analytics tools (src/mcp/tools/\*.ts) are separate modules (who_said, sentiment_trends, sentiment_distribution, stats_activity), intended to run with a PG “messages” schema.
- Data stores
  - Postgres: analytics (messages table with tsv, media*types, sentiment_score, subjectivity, tz*\*, etc.).
  - SQLite (better-sqlite3): logging/media (utils.js): logs and media tables; used by list_messages in mcp-tools.js and resources in src/mcp/resources.ts (once wired).
- Security
  - API key enforcement in src/mcp.ts and mcp-tools.js wrappers.
  - Guardrails/rateLimit/sanitize scaffolds in src/security/\*.
- Timezone
  - TZ helpers in src/time/tz.ts: getEffectiveTz, toLocalKeys, resolveNaturalRange.

Current state (as of this repo snapshot)

- Build/CI
  - package.json consolidated; test scripts build first; `pg` is a dependency for analytics tools.
  - tsconfig.json is a single NodeNext project emitting to `dist/`.
  - CI uses `npm ci`, builds, then runs tests and lint.
- Resources (src/mcp/resources.ts)
  - registerResources(logDb, logSecret) wires history/context/media to SQLite logs/media.
  - src/mcp.ts passes logDb/logSecret to registerResources.
- Tools (Postgres)
  - who_said: participants/lang filters added; regex guarded.
  - sentiment_trends: uses AVG(subjectivity) with filters for target/lang/types.
  - sentiment_distribution: SQL width_bucket with filters; returns edges/counts/summary.
  - stats_activity: my_share_pct computed from sender match; types/lang filters added.
- Send pipeline
  - src/mcp/tools/sendMessage.ts applies rate limiting, guardrails, approval gating, sanitization, and uses Matrix client to send.
- Ingest
  - src/ingest/matrix.ts relies on global fetch (Node >=18). Sync loop remains a future task.
- Index/search and status
  - src/index/search.ts: functional BM25 ts_rank; supports from/to, rooms, participants, lang, and types filters.
  - src/index/status.ts: returns basic index status (embedding model version and pending_reembed).
- Utilities/logging/media (SQLite)
  - utils.js: append/rotate, tailFile, encrypt/decrypt, logs/media CRUD, media downloader; ready and tested patterns exist (in original tests, not yet added here).
- Security
  - src/security/guardrails.ts, src/security/rateLimit.ts, src/security/sanitize.ts: present and usable.

What’s missing vs. the roadmap (prioritized TODOs)

Batch A — Build/packaging and CI hygiene

- package.json
  - Remove the duplicate second top-level JSON object.
  - Scripts:
    - build: tsc -p tsconfig.json && cp mcp-tools.js dist/
    - start: node dist/server.js (or node dist/src/server.js if that’s your emitted path)
    - test: npm run build && node --test dist/\*_/_.js
    - test:coverage: npm run build && c8 --check-coverage ... node --test dist/\*_/_.js
  - Dependencies: add "pg": "^8.12.0" to the first object; add test deps if you plan to add tests now (pg-mem, supertest, testcontainers).
- tsconfig.json
  - Replace references file with a single NodeNext project (module: NodeNext, moduleResolution: NodeNext, target: ES2022, outDir: dist, include: src/\*_/_.ts, mcp-tools.d.ts).
- .github/workflows/ci.yml
  - Use npm ci; build before test; then test:coverage; then lint.

Batch B — Wire resources to SQLite

- src/mcp/resources.ts
  - import { queryLogs } from "../../utils.js";
  - Change registerResources(logDb: any, logSecret?: string); persist refs for handlers.
  - Implement:
    - history: queryLogs(logDb, roomId, limit, from, to, logSecret)
    - context: lookup anchor ts by event_id from SQLite, return ±window around anchor via queryLogs
    - media: lookup metadata by event_id from media table
- src/mcp.ts
  - registerResources(logDb, logSecret) instead of registerResources().

Batch C — Tools: safety and filters

- src/mcp/schemas/tools.ts
  - who_said: add participants (string[]) and lang (string) to properties.
- src/mcp/tools/whoSaid.ts
  - Add filters: participants => sender = ANY($i), lang => lang = $i.
  - Guard regex: limit pattern length; try/catch RegExp; case-insensitive; otherwise exact match.
- src/mcp/tools/sentimentTrends.ts
  - Use AVG(subjectivity) AS subjectivity_mean.
  - Add filters for input.target?.room, input.target?.participant, input.lang, input.types (text vs media_types logic).
- src/mcp/tools/sentimentDistribution.ts
  - Replace client-side binning with SQL width_bucket(sentiment_score, -1, 1, $bins); add same filters as trends; compute summary (count, mean) via SQL.
- src/mcp/tools/activity.ts
  - Add filters: input.target?.participant, input.types (same media_types logic), optional lang.
  - Compute my_share_pct via 100.0 \* AVG(CASE WHEN sender = $me THEN 1 ELSE 0 END); push config.matrix.userId as param.

Batch D — Send gating and delivery

- src/mcp/tools/sendMessage.ts
  - Before send: rateLimiter("mcp_tools_send", config.mcp.rateLimits.send); const guard = checkGuardrails(...); if !ok return blocked reason.
  - Request approval via requestApproval; if !approval.send return approval_required with form.
  - Sanitize text via sanitizeText; send via sendMessage(room_id, text) from src/matrix/client.ts.

Batch E — Ingest

- src/ingest/matrix.ts
  - Remove import of node-fetch (Node >=18 has global fetch).
  - Future: implement sync loop, normalize events, compute tz keys (toLocalKeys), tsv, words, attachments, and persist to messages.

Batch F — Tests and quality gates (TDD)

- Unit tests
  - security/sanitize: strips HTML and clamps length.
  - security/guardrails: blocked keywords; do_not_impersonate behavior.
  - security/rateLimit: token bucket limits then refills over time (mock Date.now or increment).
  - utils: FileSessionStore encrypt/decrypt; tailFile decrypts valid lines, skips invalid.
- Integration tests (pg-mem or testcontainers)
  - who_said: exact and regex guarded; participants/lang filters.
  - sentiment_trends: bucket stats including subjectivity_mean.
  - sentiment_distribution: histogram with width_bucket; summary count/mean matches counts.
  - stats_activity: my_share_pct computed by sender; types/lang filters.
- Resources (SQLite)
  - history/context/media: mock SQLite DB using utils.openLogDb; insert rows and assert outputs.
- System test
  - MCP HTTP well-known and auth: /.well-known/mcp.json ok; resources/list and resources/read error without API key, success with API key.

Batch G — Cloud readiness (next phase)

- Containerization
  - Dockerfile and docker-compose for Postgres and the app; build dist/ then run node dist/server.js.
- Migrations and indexes
  - SQL migrations for messages schema:
    - Columns: event_id, room_id, sender, ts_utc timestamptz, tsv tsvector, lang text, media_types text[], words int, attachments int, sentiment_score float, subjectivity float, tz_day text, tz_week int, tz_month int, tz_year int, text text, embedding_model_ver text, etc.
    - Indexes: GIN on tsv; GIN on media_types; btree on (room_id, ts_utc), (sender), (lang).
- Multi-tenant (if hosting for others)
  - Add owner_id column and Postgres RLS policies; set current_setting('app.user') on connection from API key scope; instrument the code to set it per request if multi-tenant.

Quick gaps list by file (for fast triage)

- package.json: duplicate 2nd object; scripts not building before test; start path wrong; missing pg in first object.
- tsconfig.json: references, not single NodeNext project.
- .github/workflows/ci.yml: uses npm install; not building before tests.
- src/mcp/resources.ts: history/context/media stubs; registerResources has no db/secret.
- src/mcp.ts: calls registerResources() without db/secret.
- src/mcp/schemas/tools.ts: who_said missing participants/lang.
- src/mcp/tools/whoSaid.ts: missing participants/lang filters; unsafe regex.
- src/mcp/tools/sentimentTrends.ts: subjectivity column wrong; missing target/lang/types filters.
- src/mcp/tools/sentimentDistribution.ts: client-side binning; missing full filters.
- src/mcp/tools/activity.ts: is_me column; missing types/participant filters; wrong my_share_pct.
- src/mcp/tools/sendMessage.ts: stub; no guardrails/rateLimit/approval/sanitize/send.
- src/ingest/matrix.ts: imports node-fetch; not implemented.

Acceptance criteria (Minimum viable release)

- Build/CI: npm ci; npm run build; npm test passes on a clean clone; CI builds then runs tests.
- MCP HTTP: well-known endpoint works; resources/list and resources/read gated by API key; history/context/media return actual data when SQLite DB has rows.
- Analytics tools over Postgres:
  - who_said supports participants/lang and guards regex.
  - sentiment_trends: per-bucket stats with subjectivity_mean; filters functional.
  - sentiment_distribution: width_bucket histogram and summary; filters functional.
  - stats_activity: correct my_share_pct; filters functional.
- Send tool:
  - rate limiting in effect; guardrails and approval gating observed; sanitized text sent via Matrix client when approved.
- Documentation:
  - README updated with setup, environment variables, build/run, and test instructions.

Next steps (recommended order)

1. Apply Batch A (packaging/CI) to get stable builds.
2. Apply Batch B (resources wiring) to make resources useful.
3. Apply Batch C (tools fixes) for analytics correctness and safety.
4. Apply Batch D (send gating) for safe send capability.
5. Add tests (Batch F) and stabilize CI.
6. Plan and implement ingest loop (Batch E).
7. Add containerization and migrations (Batch G) for cloud‑readiness.

Notes for contributors

- Prefer SQL‑pushed filters and aggregates (avoid client‑side loops on large datasets).
- Keep API key gating consistent across MCP surfaces (tools and resources).
- Use prepared statements and pooling (one Pool per process) for Postgres.
- Before adding new tools/resources, add/update JSON schemas in src/mcp/schemas/tools.ts and corresponding tests.
- Security advisories and mitigations
  - matrix-js-sdk upgraded to ^37.13.0 to address GHSA advisories (freeze on bad predecessor, overly permissive key sharing, MXC path traversal). Breaking changes are managed via our stubs and wrappers.
  - Do not auto-verify devices. The previous `setDeviceVerified` sweep has been removed to avoid accidental key sharing to malicious devices. Leave verification to explicit user workflows and cross-signing.
  - Media MXC handling: we sanitize filenames and store media under per-room directories to avoid traversal; keep using `safeFilename` and never trust remote filenames.
