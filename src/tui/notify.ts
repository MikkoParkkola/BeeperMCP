import type { InboxItem } from '../cli/commands/inbox.js';

export interface NotifyState {
  inboxIdsSeen: Set<string>;
  lastRefresh: number;
}

export function initNotifyState(): NotifyState {
  return { inboxIdsSeen: new Set<string>(), lastRefresh: Date.now() };
}

export function computeInboxDelta(
  oldState: NotifyState,
  inbox: InboxItem[],
): { newCount: number; updatedState: NotifyState; newIds: Set<string> } {
  const seen = new Set(oldState.inboxIdsSeen);
  const open = inbox.filter((i) => i.status === 'open');
  const newIds = new Set<string>();
  for (const it of open) {
    if (!seen.has(it.id)) {
      newIds.add(it.id);
      seen.add(it.id);
    }
  }
  return {
    newCount: newIds.size,
    newIds,
    updatedState: { inboxIdsSeen: seen, lastRefresh: Date.now() },
  };
}

export function shouldBell(cfg: {
  settings?: { enableBell?: boolean };
}): boolean {
  return Boolean(cfg.settings?.enableBell);
}
