export function log(kind: string, payload: any, correlationId?: string) {
  const rec = {
    ts: new Date().toISOString(),
    kind,
    correlationId: correlationId ?? null,
    payload,
  };
  console.log(JSON.stringify(rec));
}
