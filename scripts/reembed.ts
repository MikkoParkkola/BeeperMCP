#!/usr/bin/env ts-node
import { runReembedBatch } from '../src/index/reembed.js';

async function main() {
  const limit = Number(process.env.REEMBED_LIMIT ?? 200);
  let total = 0;
  for (;;) {
    const n = await runReembedBatch(limit);
    total += n;
    // eslint-disable-next-line no-console
    console.log(`Re-embedded ${n} rows (total ${total})`);
    if (n === 0) break;
  }
  // eslint-disable-next-line no-console
  console.log(`Done. Total updated: ${total}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
