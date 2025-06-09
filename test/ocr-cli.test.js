import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { parseArgs, readConfig, writeConfig } from '../ocr-cli.js';

const tmpCfg = path.join(os.tmpdir(), 'mistral-ocr-test.json');

test('parseArgs extracts options and files', () => {
  const { opts, files } = parseArgs(['node', 'script', '--api-key', 'k', '--format', 'txt', 'a.pdf', 'b.png']);
  assert.strictEqual(opts.apiKey, 'k');
  assert.strictEqual(opts.format, 'txt');
  assert.deepStrictEqual(files, ['a.pdf', 'b.png']);
});

test('readConfig and writeConfig persist values', () => {
  if (fs.existsSync(tmpCfg)) fs.unlinkSync(tmpCfg);
  let cfg = readConfig(tmpCfg);
  assert.strictEqual(cfg.apiKey, '');
  cfg.apiKey = 'abc';
  writeConfig(tmpCfg, cfg);
  cfg = readConfig(tmpCfg);
  assert.strictEqual(cfg.apiKey, 'abc');
  fs.unlinkSync(tmpCfg);
});
