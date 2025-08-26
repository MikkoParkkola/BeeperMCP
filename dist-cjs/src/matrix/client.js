'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.sendMessage = sendMessage;
const config_js_1 = require('../config.js');
async function sendMessage(roomId, text) {
  const url = `${config_js_1.config.matrix.homeserverUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config_js_1.config.matrix.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ msgtype: 'm.text', body: text }),
  });
  if (!res.ok)
    throw new Error(`Matrix send failed: ${res.status} ${res.statusText}`);
  return res.json();
}
