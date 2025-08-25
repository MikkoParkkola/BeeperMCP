import test from 'node:test';
import assert from 'node:assert/strict';

// We will import the built JS from dist to avoid TS
import { maybeAutoUpdate } from '../dist/src/update/autoUpdate.js';

// Minimal Response polyfill
if (typeof Response === 'undefined') {
  global.Response = class {
    constructor(body, init) {
      this._body = body;
      this.status = init.status || 200;
      this.ok = this.status >= 200 && this.status < 300;
      this.headers = init.headers || {};
    }
    async json() {
      return JSON.parse(this._body || 'null');
    }
    async text() {
      return String(this._body || '');
    }
    async arrayBuffer() {
      return new TextEncoder().encode(String(this._body || '')).buffer;
    }
    get body() {
      return null;
    }
  };
}

// Force non-packaged path to avoid actual file replacement
process.pkg = undefined;

test('maybeAutoUpdate returns not packaged when not pkg', async () => {
  const res = await maybeAutoUpdate({ force: true });
  assert.equal(res.replaced, false);
  assert.match(res.reason || '', /Not a packaged/);
});
