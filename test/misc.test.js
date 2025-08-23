import test from 'node:test';
import assert from 'node:assert';

const sampling = await import('../dist/src/mcp/sampling.js');
const elicitation = await import('../dist/src/mcp/elicitation.js');
const allow = await import('../dist/src/security/allowlist.js');
const flags = await import('../dist/src/flags.js');

test('sample falls back without OPENAI_API_KEY', async () => {
  delete process.env.OPENAI_API_KEY;
  const res = await sampling.sample({ prompt: 'hello' });
  assert.equal(res.text, 'LLM: hello');
  assert.deepEqual(res.citations, []);
});

test('requestApproval returns send=false stub', async () => {
  const out = await elicitation.requestApproval({
    room_id: 'r',
    draft_preview: 'x',
  });
  assert.equal(out.send, false);
  assert.equal(out.room_id, 'r');
});

test('isAllowed checks tool id allowlist', () => {
  // main branch allows 'search' tool id
  assert.equal(allow.isAllowed('search'), true);
  assert.equal(allow.isAllowed('unknown_tool'), false);
});

test('onEmbeddingModelChange emits event', (t, done) => {
  const { versionEvents, onEmbeddingModelChange } = flags;
  versionEvents.once('embeddingModelChanged', (ver) => {
    try {
      assert.equal(ver, 'new-ver');
      done();
    } catch (e) {
      done(e);
    }
  });
  onEmbeddingModelChange('new-ver');
});
