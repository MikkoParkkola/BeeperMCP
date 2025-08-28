export type NetworkTag =
  | 'whatsapp'
  | 'signal'
  | 'telegram'
  | 'imessage'
  | 'sms'
  | 'instagram'
  | 'facebook'
  | 'slack'
  | 'discord'
  | 'twitter'
  | 'teams'
  | 'matrix'
  | '?';

const cache = new Map<string, { tag: NetworkTag; ts: number }>();
const TTL_MS = 10 * 60 * 1000;

export function inferNetworkFromSender(sender: string): NetworkTag {
  const s = (sender || '').toLowerCase();
  if (/(wa|whatsapp)/.test(s)) return 'whatsapp';
  if (/signal/.test(s)) return 'signal';
  if (/telegram|tg\b/.test(s)) return 'telegram';
  if (/imessage|icloud|apple/.test(s)) return 'imessage';
  if (/\bsms\b/.test(s)) return 'sms';
  if (/instagram|ig\b/.test(s)) return 'instagram';
  if (/facebook|fb\b/.test(s)) return 'facebook';
  if (/slack/.test(s)) return 'slack';
  if (/discord/.test(s)) return 'discord';
  if (/twitter|x\.com|tweet/.test(s)) return 'twitter';
  if (/msteams|teams|office/.test(s)) return 'teams';
  if (/matrix|@.+:.+/.test(s)) return 'matrix';
  return '?';
}

export function inferNetworkForRoom(db: any, roomId: string): NetworkTag {
  const now = Date.now();
  const cached = cache.get(roomId);
  if (cached && now - cached.ts < TTL_MS) return cached.tag;
  try {
    const rows = db
      .prepare(
        'SELECT line FROM logs WHERE room_id = ? ORDER BY ts DESC LIMIT 30',
      )
      .all(roomId);
    for (const r of rows) {
      const line = String(r.line || '');
      const m = line.match(/^\[(.+?)\]\s+<([^>]+)>\s+(.*)$/);
      const sender = m?.[2] || '';
      const tag = inferNetworkFromSender(sender);
      if (tag !== '?') {
        cache.set(roomId, { tag, ts: now });
        return tag;
      }
    }
  } catch {}
  cache.set(roomId, { tag: '?', ts: now });
  return '?';
}
