'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.incr = incr;
exports.recordDuration = recordDuration;
exports.get = get;
exports.snapshot = snapshot;
exports.snapshotAll = snapshotAll;
exports.snapshotVerbose = snapshotVerbose;
const counters = new Map();
const rates = new Map();
const lastTs = new Map();
const durSum = new Map();
const durCount = new Map();
const hist = new Map();
const ALPHA = Number(process.env.METRICS_ALPHA ?? 0.3);
function incr(name, by = 1) {
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
function recordDuration(name, ms) {
  durSum.set(name, (durSum.get(name) ?? 0) + ms);
  durCount.set(name, (durCount.get(name) ?? 0) + 1);
  const bins = hist.get(name) ?? Array(10).fill(0);
  const edges = [50, 100, 200, 400, 800, 1600, 3200, 6400, 12800];
  let idx = edges.findIndex((e) => ms < e);
  if (idx === -1) idx = bins.length - 1;
  bins[idx] += 1;
  hist.set(name, bins);
}
function get(name) {
  return counters.get(name) ?? 0;
}
function snapshot() {
  return Object.fromEntries(counters.entries());
}
function snapshotAll() {
  return {
    counters: Object.fromEntries(counters.entries()),
    rates: Object.fromEntries(rates.entries()),
  };
}
function snapshotVerbose() {
  const lastObj = {};
  for (const [k, t] of lastTs.entries()) lastObj[k] = new Date(t).toISOString();
  const sumObj = Object.fromEntries(durSum.entries());
  const cntObj = Object.fromEntries(durCount.entries());
  const avgObj = {};
  for (const [k, s] of Object.entries(sumObj)) {
    const c = cntObj[k] ?? 0;
    avgObj[k] = c ? s / c : 0;
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
