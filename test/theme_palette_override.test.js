import test from 'node:test';
import assert from 'node:assert/strict';
import {
  setTheme,
  getTheme,
  setPaletteColor,
  THEMES,
} from '../dist/src/tui/theme.js';

test('theme palette override', () => {
  const cfg = {};
  setTheme(cfg, 'light');
  const t1 = getTheme(cfg);
  assert.deepEqual(
    t1,
    THEMES.light,
    'setTheme(light) should equal THEMES.light',
  );

  setPaletteColor(cfg, 'highlight', 'red');
  const t2 = getTheme(cfg);
  assert.equal(t2.highlight, 'red');
  assert.equal(t2.bg, THEMES.light.bg);
  assert.equal(t2.fg, THEMES.light.fg);
});
