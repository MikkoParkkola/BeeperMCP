import fs from 'fs/promises';
import { appendWithRotate, createFileAppender } from '../utils.js';

const ITER = 5000;
const FILE1 = '.bench-direct.log';
const FILE2 = '.bench-queued.log';

async function benchDirect() {
  await fs.unlink(FILE1).catch(() => {});
  const start = Date.now();
  for (let i = 0; i < ITER; i++) {
    await appendWithRotate(FILE1, `line ${i}`, 10_000_000);
  }
  return Date.now() - start;
}

async function benchQueued() {
  await fs.unlink(FILE2).catch(() => {});
  const writer = createFileAppender(FILE2, 10_000_000, undefined, 1000, ITER);
  const start = Date.now();
  for (let i = 0; i < ITER; i++) {
    writer.queue(`line ${i}`);
  }
  await writer.flush();
  return Date.now() - start;
}

(async () => {
  const d = await benchDirect();
  const q = await benchQueued();
  console.log(`direct: ${d}ms`);
  console.log(`queued: ${q}ms`);
})();
