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

export async function createRoom(opts: {
  name?: string;
  encrypted?: boolean;
  isDirect?: boolean;
  invite?: string[];
}): Promise<{ room_id: string }> {
  const url = `${config.matrix.homeserverUrl}/_matrix/client/v3/createRoom`;
  const body: any = {
    name: opts.name,
    preset: 'private_chat',
  };
  if (opts.isDirect) body.is_direct = true;
  if (opts.invite?.length) body.invite = opts.invite;
  if (opts.encrypted) {
    body.initial_state = [
      {
        type: 'm.room.encryption',
        state_key: '',
        content: { algorithm: 'm.megolm.v1.aes-sha2' },
      },
    ];
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.matrix.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok)
    throw new Error(
      `Matrix createRoom failed: ${res.status} ${res.statusText}`,
    );
  return res.json();
}

export async function createDm(userId: string): Promise<{ room_id: string }> {
  return createRoom({ isDirect: true, invite: [userId] });
}

export async function joinRoom(
  roomIdOrAlias: string,
  serverNames?: string[],
): Promise<{ room_id: string }> {
  // Use the generic join endpoint that supports aliases and room IDs
  // POST /_matrix/client/v3/join/{roomIdOrAlias}?server_name=hs1&server_name=hs2
  const base = `${config.matrix.homeserverUrl}/_matrix/client/v3/join/${encodeURIComponent(
    roomIdOrAlias,
  )}`;
  const qs = (serverNames || [])
    .map((s) => `server_name=${encodeURIComponent(s)}`)
    .join('&');
  const url = qs ? `${base}?${qs}` : base;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.matrix.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  if (!res.ok)
    throw new Error(`Matrix join failed: ${res.status} ${res.statusText}`);
  return res.json();
}
