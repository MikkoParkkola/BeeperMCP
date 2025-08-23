import test from 'node:test';
import assert from 'node:assert';
import { capabilities } from '../dist/src/mcp/capabilities.js';

test('capabilities exposes resources, tools, overview', () => {
  const caps = capabilities();
  assert.ok(Array.isArray(caps.resources) && caps.resources.length > 0);
  assert.ok(Array.isArray(caps.tools) && caps.tools.length > 0);
  const t = caps.tools[0];
  assert.ok(typeof t.id === 'string' && t.id.length > 0);
  assert.ok(typeof t.inputSchema === 'object');
  assert.equal(caps.sampling, true);
  assert.equal(caps.elicitation, true);
  assert.ok(Array.isArray(caps.utilities));
  assert.ok(caps.overview && caps.overview.rateLimits);
  assert.ok(caps.overview && caps.overview.featureFlags);
});
