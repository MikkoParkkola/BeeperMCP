import test from 'node:test';
import assert from 'node:assert/strict';
import Ajv from 'ajv';

import {
  inputSchema as draftSchema,
  handler as draftHandler,
} from '../../src/mcp/tools/draftReply.js';
import {
  inputSchema as recapSchema,
  handler as recapHandler,
} from '../../src/mcp/tools/recap.js';

const ajv = new Ajv({ allErrors: true });

function hasCitation(obj: any) {
  return (
    Array.isArray(obj.citations) &&
    obj.citations.length > 0 &&
    obj.citations.every(
      (c: any) =>
        typeof c.event_id === 'string' && typeof c.ts_utc === 'string',
    )
  );
}

test('draft_reply schema compliance and citations', async () => {
  const validInput = { room: 'room1', eventId: 'evt1' };
  const validate = ajv.compile(draftSchema);
  assert.equal(validate(validInput), true);
  const res = await draftHandler(validInput);
  assert.ok(typeof res.draft === 'string' && res.draft.length > 0);
  assert.ok(hasCitation(res));
  assert.equal(res.citations[0].event_id, validInput.eventId);
});

test('recap schema compliance and citations', async () => {
  const validInput = { room: 'room1', startEventId: 'evt1' };
  const validate = ajv.compile(recapSchema);
  assert.equal(validate(validInput), true);
  const res = await recapHandler(validInput);
  assert.ok(typeof res.summary === 'string' && res.summary.length > 0);
  assert.ok(hasCitation(res));
  assert.equal(res.citations[0].event_id, validInput.startEventId);
});
