import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getEffectiveTone,
  getEffectiveLanguage,
  setRoomOverrides,
  clearRoomOverrides,
} from '../dist/src/tui/overrides.js';

test('overrides: default tone is concise', () => {
  assert.equal(getEffectiveTone({}), 'concise');
});

test('overrides: global tone/lang respected when no room override', () => {
  const cfg = { settings: { tone: 'friendly', language: 'en' } };
  assert.equal(getEffectiveTone(cfg), 'friendly');
  assert.equal(getEffectiveLanguage(cfg), 'en');
  assert.equal(getEffectiveTone(cfg, 'roomX'), 'friendly');
  assert.equal(getEffectiveLanguage(cfg, 'roomX'), 'en');
});

test('overrides: room override takes precedence', () => {
  const cfg = {
    settings: {
      tone: 'concise',
      language: 'en',
      roomOverrides: { room1: { tone: 'formal', language: 'fi' } },
    },
  };
  assert.equal(getEffectiveTone(cfg, 'room1'), 'formal');
  assert.equal(getEffectiveLanguage(cfg, 'room1'), 'fi');
  // other room falls back to globals
  assert.equal(getEffectiveTone(cfg, 'other'), 'concise');
  assert.equal(getEffectiveLanguage(cfg, 'other'), 'en');
});

test('overrides: set + merge + clear', () => {
  let cfg = {};
  cfg = setRoomOverrides(cfg, 'roomZ', { tone: 'friendly' });
  assert.deepEqual(cfg.settings.roomOverrides.roomZ, { tone: 'friendly' });
  cfg = setRoomOverrides(cfg, 'roomZ', { language: 'sv' });
  assert.deepEqual(cfg.settings.roomOverrides.roomZ, {
    tone: 'friendly',
    language: 'sv',
  });
  cfg = clearRoomOverrides(cfg, 'roomZ');
  assert.ok(!cfg.settings.roomOverrides.roomZ);
});
