import test from 'node:test';
import assert from 'node:assert/strict';
import {
  listModelsForProvider,
  sendChat,
} from '../dist/src/cli/providers/index.js';

function mockFetchSequence(responses) {
  let call = 0;
  // @ts-ignore
  globalThis.fetch = async () => {
    const i = Math.min(call, responses.length - 1);
    const r = responses[i];
    call++;
    if (r.throw) throw new Error(r.throw);
    if (r.never) return new Promise(() => {}); // hang for timeout
    return new Response(r.body ?? '', {
      status: r.status ?? 200,
      headers: { 'content-type': r.json ? 'application/json' : 'text/plain' },
    });
  };
  return () => call;
}

// Polyfill Response for node:test env older nodes
if (typeof Response === 'undefined') {
  global.Response = class {
    constructor(body, init) {
      this._body = body;
      this.status = init.status || 200;
      this.headers = new Map();
      this.ok = this.status >= 200 && this.status < 300;
      this.body = null;
    }
    async json() {
      return JSON.parse(this._body || 'null');
    }
    async text() {
      return String(this._body || '');
    }
  };
}

test('sendChat retries on 500 then succeeds (openai)', async () => {
  const getCalls = mockFetchSequence([
    { status: 500, body: 'err' },
    {
      status: 200,
      json: true,
      body: JSON.stringify({ choices: [{ message: { content: 'ok' } }] }),
    },
  ]);
  const p = {
    type: 'openai',
    name: 'o',
    apiKey: 'k',
    baseUrl: 'https://api.openai.com',
  };
  const out = await sendChat(p, 'gpt', [{ role: 'user', content: 'hi' }]);
  assert.equal(out, 'ok');
  assert.equal(getCalls(), 2);
});

test('listModelsForProvider returns ids with retry (openrouter)', async () => {
  const getCalls = mockFetchSequence([
    { throw: 'network' },
    {
      status: 200,
      json: true,
      body: JSON.stringify({ data: [{ id: 'm1' }, { id: 'm2' }] }),
    },
  ]);
  const p = {
    type: 'openrouter',
    name: 'r',
    apiKey: 'k',
    baseUrl: 'https://openrouter.ai',
  };
  const ids = await listModelsForProvider(p);
  assert.deepEqual(ids, ['m1', 'm2']);
  assert.equal(getCalls(), 2);
});

test('sendChat times out and retries then succeeds (ollama)', async () => {
  const getCalls = mockFetchSequence([
    { never: true },
    {
      status: 200,
      json: true,
      body: JSON.stringify({ message: { content: 'done' } }),
    },
  ]);
  const p = { type: 'ollama', name: 'ol', host: 'http://127.0.0.1:11434' };
  const out = await sendChat(p, 'llm', [{ role: 'user', content: 'x' }]);
  assert.equal(out, 'done');
  assert.equal(getCalls(), 2);
});
