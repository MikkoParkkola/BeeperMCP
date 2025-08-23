import test from 'node:test';
import assert from 'node:assert';
import { Progress } from '../dist/src/mcp/progress.js';

test('Progress emits cancel and progress events', async () => {
  const p = new Progress();
  let cancelled = false;
  let progressEvent = null;
  p.on('cancel', () => (cancelled = true));
  p.on('progress', (e) => (progressEvent = e));
  p.emitProgress({ id: '1', kind: 'step', progress: 0.5, message: 'half' });
  p.cancel();
  assert.equal(p.cancelRequested, true);
  assert.equal(cancelled, true);
  assert.deepEqual(progressEvent, {
    id: '1',
    kind: 'step',
    progress: 0.5,
    message: 'half',
  });
});
