import { config } from '../config.js';

export async function sendMessage(roomId: string, text: string) {
  const url = `${config.matrix.homeserverUrl}/_matrix/client/v3/rooms/${encodeURIComponent(
    roomId,
  )}/send/m.room.message`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.matrix.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ msgtype: 'm.text', body: text }),
  });
  if (!res.ok)
    throw new Error(`Matrix send failed: ${res.status} ${res.statusText}`);
  return res.json();
}
