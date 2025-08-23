# Backlog and Work Packages

This backlog groups work into ~500 LOC (or less) packages so multiple contributors can progress in parallel with clear scope and acceptance criteria.

## Chat CLI

- Chat CLI Streaming + UX polish
  - Scope: Add streaming output, history truncation, error banners, and help refinements; support multi-line input and copy-to-clipboard toggles.
  - Files: `src/cli/chat.ts`, `docs/INTERFACES.md`, `README.md`
  - Acceptance: Streams tokens for providers that support it; keeps memory bounded; `/help` shows all commands; tests for non-regression.

- Provider Adapters Modularization
  - Scope: Extract per-provider modules (OpenAI/Anthropic/OpenRouter/Ollama), add retries, timeouts, proxy env support; centralize model listing + chat APIs.
  - Files: `src/cli/providers/{openai,anthropic,openrouter,ollama}.ts`, `src/cli/chat.ts`
  - Acceptance: All providers work behind HTTP proxy; consistent error messages; unit tests for adapters.

## Updater and Release

- Updater Robustness + Resume
  - Scope: Add resume support (range requests), exponential backoff, Windows swap-on-restart finalization, partial download cleanup, and better errors.
  - Files: `src/update/autoUpdate.ts`
  - Acceptance: Interrupted download resumes; Windows finalizes on next run; detailed reason codes surfaced; tests for checksum mismatch and resume path.

- Signed Release Manifests
  - Scope: Generate and upload `checksums.txt`, `manifest.json`, and `manifest.sig` (cosign or minisign). Verify signature before applying update.
  - Files: `.github/workflows/release-binaries.yml`, `.github/workflows/prerelease-binaries.yml`, `src/update/autoUpdate.ts`, `docs/CI.md`, `README.md`
  - Acceptance: Releases contain signed manifest; updater rejects unsigned/invalid signatures; documented verification process.

- Multi-arch Packaging Matrix (opt-in)
  - Scope: Add optional arm64 outputs; adjust `pkg` assets; detect Rosetta and warn if native arm64 desired; document trade-offs.
  - Files: `package.json`, workflows, `docs/CI.md`, `README.md`
  - Acceptance: Optional matrix builds produce both x64/arm64; docs explain compatibility; build remains <10m per job.

## MCP Server and Resources

- STDIO Server Controls from CLI
  - Scope: Add `/server start|stop|status` in Chat CLI to spawn/monitor STDIO MCP server; show port/status; persist last mode.
  - Files: `src/cli/chat.ts`, `src/server.ts`
  - Acceptance: User can start/stop and see status within the chat UI; process cleanup verified.

- Resources Pagination + Context Windows
  - Scope: Add `cursor` pagination to history; windowing improvements for context lookup; input validation.
  - Files: `src/mcp/resources.ts`, tests
  - Acceptance: History supports `limit` + `cursor` (forward/back); context reliably centers on anchor; unit tests.

## Analytics and Ingest

- Postgres Analytics Integration Tests
  - Scope: Add pg-mem/testcontainers-based tests for who_said/sentiment/activity filters and bucketing; enforce TDD hooks.
  - Files: `test/*.test.js` or `tests/**/*.ts`, CI config
  - Acceptance: Tests cover filters, subjectivity mean, width_bucket, my_share_pct; green on CI.

- Ingest Loop MVP
  - Scope: Implement basic sync loop: normalize events, minimal persistence to SQLite logs and media, compute tz keys; remove legacy fetch import.
  - Files: `src/ingest/matrix.ts`, `utils.js`, tests
  - Acceptance: Can ingest test fixture streams; media metadata captured; timezone keys present; unit tests pass.

## CI/CD and Security

- CI Hardening Pass
  - Scope: Re-enable optional scanners (CodeQL/Semgrep) behind repo variables; add actionlint/yamllint; cache npm steps consistently.
  - Files: `.github/workflows/*.yml`, `docs/CI.md`
  - Acceptance: Optional scanners run when enabled; CI runtime steady; clear docs for enabling/disabling.

- GH Release Notes Template + Checklist
  - Scope: Provide release template, checklist, and manual QA steps (binary smoke tests, checksum check).
  - Files: `.github/release.yml` (notes config), `docs/CI.md`
  - Acceptance: Releases show structured notes; docs include checklist.

## Config and Docs

- Config Unification + Validation
  - Scope: Tighten `src/config.ts` and `src/config/runtime.ts` defaults; unify home path resolution; schema validation errors actionable.
  - Files: `src/config.ts`, `src/config/runtime.ts`, tests
  - Acceptance: Missing/invalid vars produce helpful messages; defaults resolved to `~/.BeeperMCP/*`.

- Docs Overhaul for End Users
  - Scope: Rewrite quickstart for binaries; add screenshots/gifs; add provider setup guide; troubleshooting tree; add FAQ.
  - Files: `README.md`, `docs/*.md`, `AGENTS.md`
  - Acceptance: New users can install and chat in <5 minutes; fewer support questions.

---

Notes
- Each package targets ≤500 LOC by keeping scope tight and avoiding broad refactors.
- Parallelization: CLI, updater, CI, MCP, ingest, and docs packages have minimal coupling.
- Prioritization suggestion: start with “Updater Robustness + Resume” and “Resources Pagination + Context Windows”.
