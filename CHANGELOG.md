## 1.2.0 – Metrics, Scoped Keys, Retries, Phrase + Vector Search (RAG)

Highlights

- Metrics: EWMA rates + durations with simple histograms; verbose `/metrics?verbose=1` JSON and Prom outputs.
- Scoped API keys: `MCP_API_KEY` supports multiple keys with per-key scopes (`tools`, `resources`, or `all`).
- Send retries: exponential backoff on retryable errors with metrics (`attempt/ok/err/retry`).
- Search: phrase queries (`"quoted"`) via `phraseto_tsquery`; optional vector ANN mode via `SEARCH_MODE=vector` (pgvector).
- RAG: deterministic feature-hash embeddings; `runReembedBatch(limit)` populates `messages.embedding` and `embedding_model_ver`.
- CI: actionlint + yamllint; Docker publish workflow hardened (tags-only; manual dispatch supported).

Upgrading

- Ensure `pgvector` is installed and `messages.embedding` exists (baseline migration already adds it).
- Apply new partial index migrations: run `ts-node scripts/migrate.ts`.
- For Docker publish, set repo Actions permissions to “Read and write”.

## 1.3.1 – Single Binaries, Auto‑Update, Chat CLI (x64)

Highlights

- Single binaries: macOS x64, Linux x64, Windows x64 built via CI and published to Releases.
- Auto‑update: daily check against GitHub Releases with manifest + SHA‑256 verification; `beepermcp update` to force.
- Chat CLI: interactive UI to configure providers (OpenAI, Anthropic, OpenRouter, Ollama), select active model, and chat.
- Persistent home directory: `~/.BeeperMCP` for config, cache, and DB; fast subsequent starts.
- STDIO auth: no API key required in STDIO mode; HTTP mode still enforces keys.
- Release workflows: tagged releases and prereleases on `main` publish binaries and manifest/checksums.

Upgrading

- Download the latest binary from Releases and make it executable.
- Optional: set `BEEPERMCP_UPDATE_REPO=MikkoParkkola/BeeperMCP` to enable auto‑update.
