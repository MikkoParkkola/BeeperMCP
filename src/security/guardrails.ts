const doNotImpersonate = new Set<string>([]);
const blockedKeywords = [/wire transfer/i, /ssn/i];

export function checkGuardrails(text: string, asUser?: string) {
  if (asUser && doNotImpersonate.has(asUser)) {
    return { ok: false, reason: "do_not_impersonate" };
  }
  for (const rx of blockedKeywords) {
    if (rx.test(text)) return { ok: false, reason: "blocked_keyword" };
  }
  return { ok: true };
}
