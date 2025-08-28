# BeeperMCP Chat TUI — Vision and Implementation Plan

## Vision

Create a fast, beautiful, and intuitive terminal UI for BeeperMCP’s chat mode that anyone can use comfortably — not just developers. The TUI should feel like a modern messaging app inside the terminal: obvious navigation, helpful prompts, zero-config onboarding, and clear feedback. It should bring BeeperMCP’s relationship intelligence features to life with thoughtful UX patterns while remaining reliable, accessible, and keyboard-first.

Goals

- Instant clarity: users always know where they are and what to do next.
- Friendly defaults: sensible presets, minimal setup, progressive disclosure of advanced features.
- Smooth flow: no brittle states; recover gracefully from network or auth issues.
- Respect attention: readable typography, focused surfaces, unobtrusive notifications.
- Accessibility: great keyboard navigation, screen-reader friendliness, color-contrast aware themes.

Key Outcomes

- A “Messenger-grade” chat experience in terminal: room list, message view, input composer.
- One-/two-keystroke actions for the 80% use cases (send, switch rooms, search, edit, reply).
- Built-in discovery and help with an overlay (F1) and beginner tips.
- Works packaged as a single binary (pkg), and in dev (Node 22+).

Non-Goals (for initial release)

- Rich media preview beyond basic metadata.
- Full-blown plugin system (we’ll design for it but not ship it initially).

## Experience Design

Layout

- Left pane: Rooms/DMs with unread counts and simple presence badges.
- Main pane: Message timeline with timestamp, author, content; soft-wrap; link highlighting.
- Bottom bar: Input composer with mode indicators (stream/on, multiline, target model).
- Top bar: Context breadcrumbs and quick status (connected, indexing, rate limit, etc.).
- Overlay: Help (F1) showing shortcuts, tips, and first-run guidance.

Core Interactions

- Up/Down or j/k: Navigate room list; Enter to open.
- Ctrl+K: Quick switcher (fuzzy search rooms/people/commands).
- / commands: Command palette in the composer (autocomplete, hints).
- Shift+Enter: Multiline; Enter: send.
- Tab: Cycle focus (rooms ↔ timeline ↔ input ↔ status).
- F1: Help overlay; F2: Settings; F3: Search; F4: Filters; F10: Quit.

Helpful UX Details

- New-user onboarding overlay; contextual tips until dismissed.
- Inline errors (e.g., “auth missing”) with actions to fix, not just messages.
- Non-destructive confirmations (e.g., “unsent text detected; send or discard?”).
- Low-latency rendering; simple incremental updates to reduce flicker.

Accessibility

- High-contrast theme plus dim and light themes. Respect `NO_COLOR` and `FORCE_COLOR`.
- All actions reachable via keyboard; announce focus changes.
- Avoid color-only meaning; use shape/symbol hints.

## Technical Approach

Stack

- Rendering: Ink (React for CLIs) or Blessed. Choice: Ink for component model and ecosystem.
- Input: Ink + ink-text-input, optional keymap layer for advanced shortcuts.
- Layout: Flexbox-like via Ink; custom hooks for focus management and keybindings.
- State: A thin ChatService to isolate transport and domain logic from UI components.
- Packaging: Keep TUI in dist/ and bundle as part of packaged binary (esbuild → pkg). No native deps.

Architecture

- `src/tui/` top-level with:
  - `App.tsx`: top-level router, layout, status bar.
  - `components/Rooms.tsx`: list with unread/state indicators.
  - `components/Timeline.tsx`: virtualized-ish message view (windowed render if needed).
  - `components/Composer.tsx`: input with command autocomplete and mode chips.
  - `components/Overlays/Help.tsx`, `Settings.tsx`, `QuickSwitch.tsx`.
  - `hooks/useKeymap.ts`, `hooks/useFocus.ts`, `hooks/useRooms.ts`, `hooks/useMessages.ts`.
  - `theme/` for color tokens and style helpers.
- `src/chat/ChatService.ts` (new):
  - Abstracts sending/receiving, room membership, search, pagination.
  - Wraps current CLI chat logic (src/cli/chat.ts) — move shared logic behind interface.
  - Emits events (room added, message received, presence change, error, typing, etc.).

Integration

- New command: `beepermcp chat` auto-detects if terminal supports advanced mode; offers TUI.
- Fallback: Force legacy text mode with `--no-tui`.
- Configurable via env/flags: `BEEPERMCP_TUI=0|1`, `BEEPERMCP_THEME`, `BEEPERMCP_TUI_FONTSCALE`.

Performance & Reliability

- Keep re-render bursts under ~16ms where possible.
- Graceful degradation on limited terminals; disable animations by default.
- Robust error boundaries in React tree; status bar reflects degraded mode and recovery options.

## Implementation Plan

Phase 0 — Foundations (est. 0.5–1 day)

- Add `src/chat/ChatService.ts` interface + minimal adapter for existing CLI logic.
- Create `src/tui/` folder, scaffold Ink app and theme tokens.
- Add `--no-tui` flag and env toggle; detect CI/non-interactive to auto-fallback.

Phase 1 — MVP TUI (est. 2–3 days)

- Layout: Rooms list, Timeline, Composer, Status bar.
- Basic interactions: switch room, scroll timeline, compose + send, multiline.
- Help overlay (F1) with shortcuts; quitting safely; basic errors surfaced.

Phase 2 — Quality of Life (est. 2–3 days)

- Quick switcher (Ctrl+K) with fuzzy search.
- Message actions: copy text, open in default viewer (where applicable), retry send.
- Settings overlay: theme, stream toggle, multiline default, rate limiting hints.
- Persistence: remember last room, composer draft, toggles.

Phase 3 — Intelligence Integration (est. 2–3 days)

- Inline “insight chips” (e.g., sentiment, who-said, recap) attached to messages/threads.
- Background analytics status and gentle prompts to try tools.
- Search (F3) across history with results list and jump-to.

Phase 4 — Accessibility & Polish (est. 1–2 days)

- Screen-reader checks, aria-like cues (as feasible in terminal).
- High-contrast theme validation and color-blind friendly palette.
- Perf passes for large rooms; windowing if needed.

Phase 5 — Packaging & CI (est. 0.5–1 day)

- Ensure TUI bundles cleanly via esbuild and ships in pkg binary.
- Update prerelease workflow to run a quick TUI smoke (headless) and attach artifacts.

## Milestones & Exit Criteria

M1 (MVP): Room list + timeline + composer; send/receive; help overlay; quit safely.
M2: Quick switcher, settings, persistence, search.
M3: Intelligence chips + analytics prompts; robust error handling; packaging verified.

## Testing Strategy

- Unit: hooks (keymap, focus, data) and ChatService contract via mocks.
- Integration: snapshot + interactive tests using Ink testing utilities.
- E2E (smoke): spawn binary with a demo backend; verify key flows (open, switch, send, quit) exit 0.

## Telemetry & Observability (opt-in)

- Local-only anonymized counters for key actions (open TUI, send, switch, search).
- Error reports with redact-by-default policy; user must opt-in.

## Risks & Mitigations

- Terminal variance: detect capabilities, degrade features gracefully.
- Packaging issues: avoid dynamic import.meta.url at top-level; keep assets baked or externalized.
- Performance with large rooms: implement windowed rendering and on-demand fetch.

## Work Breakdown (Epics → Tasks)

- TUI Framework & Scaffolding
  - Ink setup, theme tokens, app skeleton, status bar.
- ChatService Abstraction
  - Extract shared logic from CLI; events + store; tests.
- Core Views & Interactions
  - Rooms, Timeline, Composer; keybindings; help overlay.
- QoL & Settings
  - Quick switcher; preferences; persistence; copy/open actions.
- Intelligence Hooks
  - Chips in timeline; prompts; tool integration surface.
- Packaging & CI
  - Esbuild bundle check; pkg artifact; CI smoke.

---

Owner: Core Team
Status: Proposed
Last Updated: 2025-08-26
