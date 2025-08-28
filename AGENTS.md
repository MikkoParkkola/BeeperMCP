inherit: true
override:

- "Workflow"
- "Definition of Done"
- "Automation"

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
- Setup script's phased run uses `initClientCrypto` which falls back to `client.getCrypto().init()` when `client.initCrypto` is unavailable.

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
  - CI runs CodeQL, Semgrep, gitleaks, dependency audit, and produces a CycloneDX SBOM. Releases include SLSA provenance where applicable.
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
  - `.github/workflows/docker-publish.yml` builds and pushes Docker images to GHCR on every push to `main`, tagging each image with the package version, commit SHA, and `latest`.
  - Security and supply-chain workflows aligned with org policy (CodeQL, Semgrep, gitleaks, SBOM). Merge queue uses GitHub native automerge.
- Resources (src/mcp/resources.ts)
  - registerResources(logDb, logSecret) wires history/context/media to SQLite logs/media.
  - src/mcp.ts passes logDb/logSecret to registerResources.
- Tools (Postgres)
  - who_said: participants/lang filters added; regex guarded; hits include Matrix URIs.
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

### TUI (new)

- Minimal Blessed-based TUI scaffold added under `src/tui/`.
- Entry: `beepermcp tui` launches a two-pane Inbox view.
  - Left: open conversations sourced from SQLite logs via triage/inbox modules.
  - Right: preview and generated drafts for the selected item.
  - Keys: Up/Down/j/k navigate, Enter generate drafts, a accept/send, s snooze, x dismiss, r refresh, q quit.
- Uses existing guardrails, rate limiter, and Matrix send pipeline. LLM prompts are sent via the active provider configured in Chat CLI (`/switch`).

## Technical Implementation

### Core Components

```typescript
// Core Architecture
interface BeeperMCPCore {
  relationshipIntelligence: RelationshipAnalyzer;
  deceptionDetection: TruthAnalysisEngine;
  temporalAnalysis: ConversationTimeline;
  behavioralPatterns: PatternRecognition;
  aiPrediction: PredictiveEngine;
  visualIntelligence: VisualizationEngine;
}
```

### Relationship Intelligence Engine

```typescript
class RelationshipAnalyzer {
  private conversationHistory: ConversationRecord[];
  private behavioralPatterns: BehavioralProfile;
  private emotionalContext: EmotionalState;

  analyzeRelationshipHealth(): RelationshipMetrics {
    return {
      trustScore: this.calculateTrustScore(),
      communicationQuality: this.assessCommunication(),
      emotionalIntelligence: this.measureEmpathy(),
      conflictResolution: this.evaluateConflictHandling(),
      growthPotential: this.predictGrowth(),
    };
  }

  detectAnomalies(): ConversationalAnomaly[] {
    const patterns = this.extractPatterns();
    const deviations = this.findDeviations(patterns);
    return this.classifyAnomalies(deviations);
  }
}
```

### Truth Analysis & Deception Detection

```typescript
class TruthAnalysisEngine {
  analyzeStatement(
    statement: string,
    context: ConversationContext,
  ): TruthAnalysis {
    const linguisticMarkers = this.extractLinguisticMarkers(statement);
    const temporalConsistency = this.checkTemporalConsistency(
      statement,
      context,
    );
    const behavioralConsistency = this.assessBehavioralConsistency(
      statement,
      context,
    );

    return {
      truthProbability: this.calculateTruthProbability(
        linguisticMarkers,
        temporalConsistency,
        behavioralConsistency,
      ),
      confidenceLevel: this.calculateConfidence(),
      inconsistencies: this.identifyInconsistencies(),
      supportingEvidence: this.findSupportingEvidence(),
      contradictoryEvidence: this.findContradictoryEvidence(),
    };
  }
}
```

### UI Implementation

The UI is built with HTML, CSS, and JavaScript, with a focus on a "glassmorphism" design. It is implemented in the `web/` directory and several root-level HTML files.

### Performance Optimization

The application uses Web Workers for real-time processing and an LRU cache for memory management.

### Security & Privacy

All data is processed locally, and the application uses end-to-end encryption.

## Continuous Integration & Delivery

This project uses GitHub Actions for CI/CD, publishing Docker images and single-file binaries, and supply‑chain checks.

### Workflows

- `ci.yml`: Build, test, lint, and create Docker image tarballs.
- `docker-publish.yml`: Build and push Docker images to GHCR.
- `release.yml`: Create GitHub Releases.
- `release-binaries.yml`: Build and attach single-file binaries to releases.
- `prerelease-binaries.yml`: Build and attach binaries to a prerelease on each push to `main`.
- `gitleaks.yml`: Scan for secrets.
- `sbom.yml`: Generate CycloneDX SBOM.
- `lint-quick.yml`: Fast ESLint run on PRs.

## Inbox, Drafting, and Watchtower

The Inbox feature streamlines replying across many rooms by gathering open conversations, showing a quick Brief ("Watchtower"), and letting you accept, edit, revise, snooze, or reject drafts with one keystroke.

### Modules and Interfaces

- `src/cli/commands/inbox.ts`
- `src/cli/commands/triage.ts`
- `src/cli/chat.ts`

## Module and Function Interfaces

### Packaging and Entry

- `src/bin.ts`
- `src/pack/bootstrap.ts`

### Packaging & SEA

- Requirements: Node 22+ and dev dep `postject` (already included). SEA is used to produce single-file binaries per-OS.
- Local build (macOS):
  - `rm -rf build sea-prep.blob sea-config.json`
  - `npm ci && npm run make:macos:sea`
  - Run: `./build/beepermcp.sea.run chat|tui|server|ui`
- Local build (Linux/Windows):
  - Linux: `npm run make:linux:sea` → `build/beepermcp.sea.run`
  - Windows: `npm run make:windows:sea` → `build\beepermcp.sea.run.exe`
- How it works:
  - We generate a tiny CommonJS shim as SEA entry that dynamic-imports the ESM CLI (`dist/src/bin.js`) to avoid `import.meta` bundling quirks.
  - SEA blob is created via `node --experimental-sea-config` and injected into the platform Node runtime with `postject` using the correct SEA fuse.
  - macOS adds `xattr -c` and ad‑hoc `codesign` to avoid quarantine/AMFI issues.
- CI:
  - `release-binaries.yml`: On tag `v*.*.*`, builds SEA binaries for macOS/Linux/Windows, packages archives named `agentsmcp-<os>-<arch>.(tar.gz|zip)`, computes `checksums.txt`, and writes a `manifest.json` (+ optional `manifest.sig`). All are attached to the GitHub Release.
  - `prerelease-binaries.yml`: On push to `main`, builds the same SEA artifacts and publishes a prerelease tagged `prerelease-<sha>` with artifacts, checksums, and manifest.
- Notes:
  - Existing `pkg` flow remains for reference but SEA is the default in CI.
  - Native modules are loaded from the filesystem at runtime by the system Node executable; the SEA entry approach avoids bundling `blessed` optional deps.

### Auto‑Update

- `src/update/autoUpdate.ts`

### MCP Server Surfaces

- `mcp-tools.js`
- `src/mcp-server.ts`
- `src/mcp.ts`
- `src/server.ts`

### Resources API

- `src/mcp/resources.ts`

### Security

- `src/security/rateLimit.ts`
- `src/security/guardrails.ts`
- `src/security/sanitize.ts`

### Utilities (SQLite, Files, Media)

- `utils.js`

### Config

- `src/config.ts`
- `src/config/runtime.ts`

### Chat CLI

- `src/cli/chat.ts`

## Release Checklist

- [ ] Bump `package.json` version and `releaseDate`.
- [ ] `npm ci && npm run build && npm run test:coverage` green locally.
- [ ] CLI smoke test.
- [ ] Resources endpoints return expected data.
- [ ] Analytics tools return expected results.
- [ ] Security/Compliance checks are green.
- [ ] Release is tagged and artifacts are attached.
- [ ] Downloaded binaries pass smoke test.
