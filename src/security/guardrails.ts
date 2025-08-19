// Allow configuration via environment variables for flexibility in CI/ops.
// DO_NOT_IMPERSONATE: comma-separated Matrix user IDs
// GUARDRAILS_BLOCKED: comma-separated regex patterns (without slashes), case-insensitive
const doNotImpersonate = new Set<string>(
  (process.env.DO_NOT_IMPERSONATE || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);
const blockedKeywords: RegExp[] = (
  process.env.GUARDRAILS_BLOCKED || 'wire transfer,ssn'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .map((s) => {
    try {
      return new RegExp(s, 'i');
    } catch {
      return null;
    }
  })
  .filter(Boolean) as RegExp[];

export function checkGuardrails(text: string, asUser?: string) {
  if (asUser && doNotImpersonate.has(asUser)) {
    return { ok: false, reason: 'do_not_impersonate' };
  }
  for (const rx of blockedKeywords) {
    if (rx.test(text)) return { ok: false, reason: 'blocked_keyword' };
  }
  return { ok: true };
}
