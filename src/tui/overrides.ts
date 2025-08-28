export type Tone = 'concise' | 'friendly' | 'formal';

export interface RoomOverrides {
  tone?: Tone;
  language?: string;
}

export interface MinimalConfigShape {
  settings?: {
    tone?: Tone;
    language?: string;
    roomOverrides?: Record<string, RoomOverrides>;
    [k: string]: unknown;
  };
}

export function getEffectiveTone(
  cfg: MinimalConfigShape,
  roomId?: string,
): Tone {
  const globalTone = (cfg.settings?.tone as Tone) || 'concise';
  if (!roomId) return globalTone;
  const ov = cfg.settings?.roomOverrides?.[roomId];
  return (ov?.tone as Tone) || globalTone;
}

export function getEffectiveLanguage(
  cfg: MinimalConfigShape,
  roomId?: string,
): string | undefined {
  const globalLang = cfg.settings?.language as string | undefined;
  if (!roomId) return globalLang;
  const ov = cfg.settings?.roomOverrides?.[roomId];
  return ov?.language || globalLang;
}

export function setRoomOverrides(
  cfg: MinimalConfigShape,
  roomId: string,
  patch: RoomOverrides,
): MinimalConfigShape {
  cfg.settings = cfg.settings || {};
  const map = (cfg.settings.roomOverrides = cfg.settings.roomOverrides || {});
  map[roomId] = { ...(map[roomId] || {}), ...patch };
  return cfg;
}

export function clearRoomOverrides(
  cfg: MinimalConfigShape,
  roomId: string,
): MinimalConfigShape {
  if (!cfg.settings?.roomOverrides) return cfg;
  delete cfg.settings.roomOverrides[roomId];
  return cfg;
}
