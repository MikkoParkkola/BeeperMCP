import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getEffectiveTone,
  getEffectiveLanguage,
  setRoomOverrides,
  clearRoomOverrides,
} from '../dist/src/tui/overrides.js';

test('overrides: unsetting tone/language falls back correctly', () => {
  let cfg = setRoomOverrides({}, 'roomA', { tone: 'formal', language: 'fi' });
  // Remove tone only (simulate unset)
  delete cfg.settings.roomOverrides.roomA.tone;
  // No global tone set -> fallback to default 'concise'
  assert.equal(getEffectiveTone(cfg, 'roomA'), 'concise');
  // Language remains
  assert.equal(getEffectiveLanguage(cfg, 'roomA'), 'fi');

  // Now set globals and remove language
  cfg.settings.tone = 'friendly';
  cfg.settings.language = 'en';
  delete cfg.settings.roomOverrides.roomA.language;
  assert.equal(getEffectiveLanguage(cfg, 'roomA'), 'en');
  assert.equal(getEffectiveTone(cfg, 'roomA'), 'friendly');
});

test('overrides: clearing empty room override prunes map entry safely', () => {
  let cfg = setRoomOverrides({}, 'roomB', { tone: 'concise' });
  delete cfg.settings.roomOverrides.roomB.tone;
  // At this point roomB has no tone/lang -> optional pruning via clear
  cfg = clearRoomOverrides(cfg, 'roomB');
  assert.ok(!cfg.settings.roomOverrides.roomB);
});
