import { test } from 'node:test';
import assert from 'assert/strict';
import { initClientCrypto } from '../phased-setup.js';

function makeLogger() {
  const logs: Record<string, any[]> = { info: [], warn: [] };
  return {
    info: (...args: any[]) => logs.info.push(args),
    warn: (...args: any[]) => logs.warn.push(args),
    logs,
  };
}

test('uses client.initCrypto when available', async () => {
  let called = false;
  const client: any = {
    initCrypto: async () => {
      called = true;
    },
    getCrypto: () => ({
      init: () => {
        throw new Error('should not be called');
      },
    }),
  };
  const logger = makeLogger();
  await initClientCrypto(client, logger as any);
  assert.equal(called, true);
});

test('falls back to crypto.init when initCrypto missing', async () => {
  let called = false;
  const client: any = {
    getCrypto: () => ({
      init: async () => {
        called = true;
      },
    }),
  };
  const logger = makeLogger();
  await initClientCrypto(client, logger as any);
  assert.equal(called, true);
});

test('logs a warning when no crypto init available', async () => {
  const client: any = {
    getCrypto: () => undefined,
  };
  const logger = makeLogger();
  await initClientCrypto(client, logger as any);
  assert.equal(logger.logs.warn.length, 1);
});
