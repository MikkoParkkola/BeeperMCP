# 📥 Inbox, ✍️ Drafting, and 🛰️ Watchtower — Design & Contribution Guide

## ✨ Overview

The Inbox feature streamlines replying across many rooms by gathering open conversations, showing a quick Brief ("Watchtower"), and letting you accept, edit, revise, snooze, or reject drafts with one keystroke. It adapts to each room’s language and audience automatically.

## 🧭 User Experience

- `/inbox` lists open items needing your reply across rooms (mentions/questions/requests with no follow‑up from you).
- Select an item to see:
  - Two tailored drafts (room language + style; your tone).
  - One‑key actions: `a` accept/send, `e` edit, `r` revise with instruction, `s` snooze, `x` reject, `v` view Watchtower/context, `t` set tone, `l` set language, `n` nudge requester.
- `/open <n>` opens item `n` directly; `/todo` lists commitments you owe.
- `/brief <room>` shows Watchtower (People, State, Decisions, Open Questions, You Owe).
- `/persona <room>` edits audience/style overrides for that room.

## 💾 Data and Persistence

- `~/.BeeperMCP/inbox.json` — queue of actionables (roomId, eventId, ts, preview, lang, status, snoozeUntil).
- `~/.BeeperMCP/room-briefs.json` — per‑room brief (language, style hints, audience notes, sensitivities, updatedAt).
- `~/.BeeperMCP/style.json` — your per‑room tone hints derived from your prior messages.
- `~/.BeeperMCP/config.json` — defaults (handles, tone, language), provider, active model.

## 🔌 Modules and Interfaces

- `src/cli/commands/inbox.ts`
  - `loadInbox(): InboxItem[]`
  - `saveInbox(items: InboxItem[]): void`
  - `refreshInbox(opts): Promise<InboxItem[]>` — scans logs for new actionables.
  - `renderInbox(items, cursor): string` — returns ASCII table/list.
  - `openItem(item, ctx)` — handles actions (`a/e/r/s/x/v/t/l/n`).

- `src/cli/commands/triage.ts` (existing)
  - `findActionables(prefs, opts): TriageCandidate[]` — heuristic detection.
  - `ensureRoomBrief(roomId, askLLM): Promise<RoomBrief>` — builds/refreshes brief from ~7d context; cached.
  - `generateDrafts(candidate, prefs, intention, extra, askLLM)` — produces two alternatives.

- `src/cli/chat.ts`
  - Add `/inbox`, `/open <n>`, `/todo`, `/brief <room>`, `/persona <room>` handlers.
  - Key input loop for one‑key actions in item view.

- Safety & Send
  - `src/security/*`: `sanitizeText()`, `checkGuardrails()`, `rateLimiter()`.
  - MCP send: call `send_message` via the existing Matrix client path, with approval prompt and guardrails.

## 🛰️ Watchtower Brief (per room)

- People: inferred roles, languages, pronouns (light heuristics from handles/profile text).
- State: current topic, “what changed” since last seen; last active voices.
- Decisions: accepted decisions (who/what/when/why); short bullets.
- Open Questions: unresolved asks and who they wait on.
- You Owe: minimal set of replies expected from you.

Implementation: Use recent logs (up to 7 days, downsampled) + small LLM prompt. Cache brief and refresh every ~3 days.

## ✍️ Drafting Pipeline

- Input: candidate (roomId, message, context), room brief, your tone/language preferences, optional revision instruction.
- Output: 2 alternatives, under ~80 words each, audience‑aware and conforming to room language.
- Iteration: apply extra instruction to regenerate.

## ⌨️ Keyboard Actions

- `a` Accept & send — sanitize, guardrail, approval confirm → send.
- `e` Edit → open `$EDITOR` (or inline), then send.
- `r` Revise → prompt for instruction, regenerate drafts.
- `s` Snooze → presets (2h, evening, tomorrow) → set `snoozeUntil`.
- `x` Reject → mark dismissed.
- `v` View Watchtower/context → return to item.
- `t` Tone → set room/user tone preset.
- `l` Language → auto/from brief/explicit code.
- `n` Nudge requester → polite reminder template tailored by brief.

## 🛠️ Implementation Plan (Phases)

- Phase A — Core inbox and send path
  - Add `/inbox` list + selector; `/open <n>`; Watchtower view.
  - Show two drafts; implement `a/e/r` flows and MCP send with safety.
- Phase B — Productivity
  - Snooze and reject; `/todo` commitments; `n` nudges; `/persona` editor.
- Phase C — Polish
  - Paging, filters by room/language/mention; multi‑select; saved custom tones.

## 🤝 Contribution Guide

- Keep changes ≤500 LOC per PR; prefer small, vertical slices.
- Add unit tests for parsing, detection, and keyboard flows where possible.
- Follow existing style (NodeNext TS, module boundaries, small helpers over big classes).
- Cache and downsample aggressively; favor heuristics over heavy LLM calls.
