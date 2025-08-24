# 🗺️ Product Roadmap — High‑Leverage Assist for Conversations

This document captures the near‑term vision to make replying, summarizing, and coordinating across rooms fast, safe, and delightful — with minimal tokens and strong offline behavior (Ollama‑friendly).

## 1) 🛰️ Room Watchtower (Quick Brief on Enter)

- Problem: Users drop into busy rooms without context; they need “what changed” and what they owe.
- Solution: A 5‑section brief generated from recent history (cached):
  - People: who’s who, roles, languages, timezones, preferences.
  - State: current topic; changes since last visit; last active voices.
  - Decisions: accepted decisions (who/what/when/why).
  - Open Questions: unresolved asks and who they’re waiting on.
  - You Owe: minimal set of replies expected from the user.
- Signals/Inputs: last ~7d logs (downsampled), simple heuristics + small LLM prompt.
- Output: `room-briefs.json` entry (language, style hints, audience notes, sensitivities, updatedAt) and a rendered brief in CLI.
- Milestones:
  - M1: Brief builder + cache + `/brief <room>`.
  - M2: Auto‑brief before `/triage` and `/inbox` item view.

## 2) ✅ Action Board (Commitments + Nudges)

- Problem: Commitments and requests scatter across rooms; following up is hard.
- Solution: Aggregate a cross‑room board of “to‑reply” and “to‑do” with one‑key nudges.
  - Commitments you made ("I'll…", "We’ll…") with target dates.
  - Unresolved asks directed at you ("Can you", "please", "ETA").
  - Nudges: respectful, audience‑aware reminders with templates.
  - Suggested reply blocks (light heuristic scheduling).
- Signals/Inputs: recent logs + heuristics; no heavy DB.
- Output: `tasks.json` with items (room, text, ts, who, due?, status), nudge drafts tailored by room brief.
- Milestones:
  - M1: `/todo` list; nudge drafts; mark done.
  - M2: Snooze, due‑date heuristics, scheduling suggestions.

## 3) 🎙️ Personal Tone Engine (Per‑Room Style + Language Autoadapt)

- Problem: AI replies can feel generic; language switching is manual.
- Solution: Learn your own style per room and auto‑adapt to the room’s dominant language.
  - Learn greetings, formality, sign‑off patterns from your own messages.
  - Blend room style (brief) + personal tone into drafting prompts.
  - Default to “write in the same language as context” unless overridden.
- Signals/Inputs: your last N messages per room; room brief language.
- Output: `style.json` (per room/user hints) and injected prompt snippets.
- Milestones:
  - M1: Style hints extraction + cache.
  - M2: Draft personalization across `/triage`, `/reply`, `/inbox`.

## 🎁 Surprise: Hold‑Reply Queue

- Problem: Actionable pings arrive during focus/sleep; users forget to acknowledge.
- Solution: Queue “ack” drafts (“Got it, I’ll get back by <time>”) tailored to requester/room; offer them on return for quick approval.
- Output: `hold-replies.json` with queued drafts; on resume, a simple approval/send flow.
- Milestones:
  - M1: Detection + queue; approval/send on next CLI session.

## 🧱 Engineering Principles

- Minimize tokens: favor heuristics + caches; downsample logs; keep prompts tight.
- Per‑room state: cache briefs, style, tasks in `~/.BeeperMCP/`.
- Safety: sanitize, guardrails, approval before send; clear “blocked reason” feedback.
- UX: one‑keystroke decisions; allow edit/revise; keep the user in flow.

## 🔗 Integration Points

- CLI: `/inbox`, `/open <n>`, `/triage`, `/reply`, `/todo`, `/brief <room>`, `/persona <room>`.
- Send path: MCP `send_message` via Matrix client; approval gating; rate limiting.
- Logs: SQLite (`messages.db`) used for recent history heuristics.
