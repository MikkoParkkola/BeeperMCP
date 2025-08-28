import test from 'node:test';
import assert from 'node:assert/strict';
import { inferNetworkFromSender } from '../dist/src/tui/network.js';

const cases = [
  ['alice@whatsapp.net', 'whatsapp'],
  ['bob@signal.org', 'signal'],
  ['charlie@telegram.org', 'telegram'],
  ['dave@icloud.com', 'imessage'],
  ['via sms', 'sms'],
  ['eve@instagram.com', 'instagram'],
  ['frank@facebook.com', 'facebook'],
  ['grace@slack.com', 'slack'],
  ['heidi@discord.com', 'discord'],
  ['ivan@twitter.com', 'twitter'],
  ['judy@teams.microsoft.com', 'teams'],
  ['ken@matrix.org', 'matrix'],
  ['unknown_sender', '?'],
  ['', '?'],
];

for (const [sender, expected] of cases) {
  test(`inferNetworkFromSender(${JSON.stringify(sender)}) -> ${expected}`, () => {
    assert.equal(inferNetworkFromSender(sender), expected);
  });
}
