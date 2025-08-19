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
