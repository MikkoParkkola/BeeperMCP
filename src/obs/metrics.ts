const counters = new Map<string, number>();
export function incr(name: string, by = 1) {
  counters.set(name, (counters.get(name) ?? 0) + by);
}
export function get(name: string): number {
  return counters.get(name) ?? 0;
}
