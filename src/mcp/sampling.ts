export interface SamplingRequest {
  prompt: string;
  maxTokens?: number;
}
export interface SamplingResult {
  text: string;
  citations?: { event_id: string; ts_utc: string }[];
}

export async function sample(_req: SamplingRequest): Promise<SamplingResult> {
  return { text: "TODO: sampling result" };
}
