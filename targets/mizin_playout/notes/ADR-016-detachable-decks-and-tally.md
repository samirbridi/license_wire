# ADR-016 — Detachable decks and on-air tally

Date: 2026-10-21. Status: accepted by the user (Samir), implementation in progress.
Order agreed for the next features: decks (this ADR) → local WebRTC monitor (ADR-017) → low-latency audio (ADR-018).

## Decision

"Destacar os decks" means both:

1. **Detach**: every deck (Preview, the single-Program deck and each multiview Program tile) gets a
   detach button. It opens the deck in its own top-level window that can be moved to another monitor,
   resized, and toggled fullscreen (double-click / F11, Esc leaves fullscreen). Closing the window docks
   the deck again. The window title names the Program and the show.
2. **Tally**: a Program deck that is on air (media loaded and playing) is highlighted with a red border and
   an ON AIR / NO AR badge, both in the multiview tile and in its detached window. The cyan selected
   border (TAKE destination) stays independent from the tally.

## Implementation rules

- A detached window creates its own `ChannelMonitor` subscribed to the same `NativeChannel::frameReady`
  frames. It never opens media or allocates a decoder, same rule as multiview and mirrors.
- The docked tile stays in the grid with a "In separate window / Em janela separada" state and hides its
  picture while detached, so the GPU does not present the same Program twice inside the desk.
- Controls in the detached window act on the Program by stable ID (play/pause, black), resolved at click
  time, as multiview tiles already do. Removing a Program or loading a show closes windows whose IDs no
  longer exist. Closing the main window closes all deck windows.
- Window geometry/screen is remembered per deck kind/Program ID in machine preferences. Deck windows are
  not reopened automatically at launch (same convention as display/network outputs).
- A deck window is an operator monitor, not an output route: it does not count as a display route and is
  not used for fullscreen program delivery (that stays in Outputs).

## Validation

Native UI checks: detach opens a visible window with a monitor bound to that Program, the docked tile
reports the detached state, controls in the window drive the right Program by ID, closing re-docks,
removing the Program closes its window, tally follows playing/black for each Program independently.
Physical second-monitor placement is an operator check, not proven by in-process tests.
