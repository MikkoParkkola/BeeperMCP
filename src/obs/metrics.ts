const counters = new Map<string, number>();
const rates = new Map<string, number>();
const lastTs = new Map<string, number>();
const durSum = new Map<string, number>();
const durCount = new Map<string, number>();
const hist = new Map<string, number[]>();
const ALPHA = Number(process.env.METRICS_ALPHA ?? 0.3);

export function incr(name: string, by = 1) {
  counters.set(name, (counters.get(name) ?? 0) + by);
  const now = Date.now();
  const prevT = lastTs.get(name);
  if (prevT !== undefined) {
    const dtMin = Math.max((now - prevT) / 60000, 1e-6);
    const inst = by / dtMin;
    const prevRate = rates.get(name) ?? inst;
    rates.set(name, ALPHA * inst + (1 - ALPHA) * prevRate);
  }
  lastTs.set(name, now);
}

export function recordDuration(name: string, ms: number) {
  durSum.set(name, (durSum.get(name) ?? 0) + ms);
  durCount.set(name, (durCount.get(name) ?? 0) + 1);
  const bins = hist.get(name) ?? Array(10).fill(0);
  const edges = [50, 100, 200, 400, 800, 1600, 3200, 6400, 12800];
  let idx = edges.findIndex((e) => ms < e);
  if (idx === -1) idx = bins.length - 1;
  bins[idx] += 1;
  hist.set(name, bins);
}

export function get(name: string): number {
  return counters.get(name) ?? 0;
}

export function snapshot(): Record<string, number> {
  return Object.fromEntries(counters.entries());
}

export function snapshotAll(): {
  counters: Record<string, number>;
  rates: Record<string, number>;
} {
  return {
    counters: Object.fromEntries(counters.entries()),
    rates: Object.fromEntries(rates.entries()),
  };
}

export function snapshotVerbose(): {
  counters: Record<string, number>;
  rates: Record<string, number>;
  lastTs: Record<string, string>;
  durations: {
    sum_ms: Record<string, number>;
    count: Record<string, number>;
    avg_ms: Record<string, number>;
    hist: Record<string, number[]>;
  };
} {
  const lastObj: Record<string, string> = {};
  for (const [k, t] of lastTs.entries()) lastObj[k] = new Date(t).toISOString();
  const sumObj = Object.fromEntries(durSum.entries());
  const cntObj = Object.fromEntries(durCount.entries());
  const avgObj: Record<string, number> = {};
  for (const [k, s] of Object.entries(sumObj)) {
    const c = (cntObj as any)[k] ?? 0;
    avgObj[k] = c ? (s as number) / c : 0;
  }
  return {
    counters: Object.fromEntries(counters.entries()),
    rates: Object.fromEntries(rates.entries()),
    lastTs: lastObj,
    durations: {
      sum_ms: sumObj,
      count: cntObj,
      avg_ms: avgObj,
      hist: Object.fromEntries(hist.entries()),
    },
  };
}
