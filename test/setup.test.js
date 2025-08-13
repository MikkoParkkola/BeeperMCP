import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import * as setupMod from '../setup.js';
const { autoDetect, validateEnv } = setupMod;

const tmp = '.test-setup';

function cleanup() {
  if (fs.existsSync(tmp)) fs.rmSync(tmp, { recursive: true, force: true });
}

test('autoDetect reads Matrix config', () => {
  cleanup();
  const home = path.resolve(tmp);
  const cfgDir = path.join(home, 'Library/Application Support/Beeper');
  fs.mkdirSync(cfgDir, { recursive: true });
  const cfg = {
    baseUrl: 'https://example.org',
    userId: '@u:example.org',
    accessToken: 'tok',
  };
  fs.writeFileSync(path.join(cfgDir, 'config.json'), JSON.stringify(cfg));
  const origHome = os.homedir;
  Object.defineProperty(os, 'homedir', { value: () => home });
  const env = {};
  autoDetect(env);
  Object.defineProperty(os, 'homedir', { value: origHome });
  assert.strictEqual(env.MATRIX_HOMESERVER, 'https://example.org');
  assert.strictEqual(env.MATRIX_USERID, '@u:example.org');
  assert.strictEqual(env.MATRIX_TOKEN, 'tok');
});

test('validateEnv flags missing fields', () => {
  const errs = validateEnv({});
  assert.ok(errs.length >= 3);
  const good = {
    MATRIX_HOMESERVER: 'https://hs',
    MATRIX_USERID: '@me:hs',
    MATRIX_TOKEN: 't',
  };
  assert.deepStrictEqual(validateEnv(good), []);
});

test.after(() => cleanup());
