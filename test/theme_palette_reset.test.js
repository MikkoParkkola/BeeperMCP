import test from 'node:test';
import assert from 'node:assert/strict';
import {
  setTheme,
  setPaletteColor,
  getTheme,
  THEMES,
} from '../dist/src/tui/theme.js';

test('theme palette reset restores original light theme', () => {
  const cfg = { settings: {} };
  setTheme(cfg, 'light');
  setPaletteColor(cfg, 'highlight', 'green');
  const t1 = getTheme(cfg);
  assert.equal(t1.highlight, 'green');
  delete cfg.settings.customTheme;
  const t2 = getTheme(cfg);
  assert.deepEqual(t2, THEMES.light);
});
