import { config } from '../config.js';

export async function startMatrixIngestLoop(): Promise<void> {
  // Minimal skeleton; implement full sync later
  // Intentionally idle until configured
  if (!config.matrix.accessToken) return;
  // TODO: Implement /_matrix/client/v3/sync loop, normalize events, compute stats/tsv/tz keys, embeddings, sentiment and persist
  return;
}
