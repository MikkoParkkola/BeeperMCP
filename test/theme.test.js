import test from 'node:test';
import assert from 'node:assert/strict';
import { THEMES, getTheme, setTheme } from '../dist/src/tui/theme.js';

test('theme: THEMES contains all expected keys', () => {
  const keys = Object.keys(THEMES).sort();
  assert.deepEqual(keys, ['dark', 'high-contrast', 'light']);
});

test('theme: getTheme defaults to dark', () => {
  const p = getTheme({});
  assert.deepEqual(p, THEMES.dark);
});

test('theme: setTheme mutates cfg and getTheme reflects', () => {
  const cfg = {};
  setTheme(cfg, 'light');
  assert.equal(cfg.settings?.theme, 'light');
  const p = getTheme(cfg);
  assert.deepEqual(p, THEMES.light);
});
