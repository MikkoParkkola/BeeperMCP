## 1.1.0 – Context pagination, metrics, CI Docker publish

Highlights

- Context resource pagination: Adds `cursor` and `dir` to re-anchor windows around events; returns `prev_cursor` and `next_cursor`. Decrypts items when `LOG_SECRET` is set.
- Metrics expansion: Adds EWMA rates and per-template resource metrics; `/metrics` supports JSON (`{ counters, rates }`) and Prom.
- Guardrails configurability: Now configurable via environment variables (`DO_NOT_IMPERSONATE`, `GUARDRAILS_BLOCKED`).
- API key rotation: Accepts comma-separated keys for MCP server and HTTP resources.
- CI Docker publish: GitHub Actions builds and pushes `ghcr.io/<owner>/<repo>:v1.1.0` and `:latest` on tag push.
- Tests simplification: Consolidated on Node’s test runner under `test/`.

Changes

- Resources
  - `im://matrix/room/:roomId/message/:eventId/context` now supports `cursor` and `dir` for pagination.
  - Response includes `prev_cursor` and `next_cursor`.
- Metrics
  - Added `snapshotAll()` with EWMA per-minute rates.
  - Instrumented `/.well-known/mcp.json`, `/metrics`, `resources/list`, and `resources/read` (including per-template metrics and error counters).
  - Prometheus format emits `<metric>_total` and `<metric>_rate`.
- Tools/Analytics
  - `sentimentTrends`: fixes `subjectivity` column to `sentiment_subjectivity`.
  - `who_said`: adds `limit` input.
  - Optional PG statement timeout via `PG_STMT_TIMEOUT`.
- Security
  - Guardrails are configurable; defaults preserved.
- Build & CI
  - `package.json` version bumped to `1.1.0`.
  - CI runs build, tests, lint, format; adds Docker Buildx job for GHCR on tag `v*`.
  - Dockerfile CMD uses `dist/beeper-mcp-server.js`; adds healthcheck probing `/.well-known/mcp.json`.

Upgrade Notes

- Push a tag `v1.1.0` to trigger the GitHub Release and Docker publish to GHCR.
- Consumers: adjust dashboards to use new `*_total` and `*_rate` metric names.

### Roadmap

- Ingest pipeline: full Matrix sync loop persisting into Postgres `messages` with embeddings, sentiment enrichment, and backfills.
- Search UX: exact phrase queries, weighted tsvector tuning, hybrid ANN re-ranking.
- Advanced metrics: latencies per tool, per-room/resource breakdown, error taxonomies.
- Multi-tenant hosting: RLS policies, request-scoped `app.user`, API key scoping.
- Container hardening: non-root runtime, read-only FS, seccomp profiles, SBOM.
