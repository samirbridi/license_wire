# ADR-022 — Web monitor access: per-session code, footer tally, QR code

Date: 2026-10-25. Status: approved by the owner, to implement next session (tokens ran out this week).

## Requests (owner, after testing NDI/OMT/Web: all working well)
1. Like P2PMizin: every start of the web monitor generates a new access code (safer).
2. Footer: show the web monitor beside NDI and OMT (running / viewers connected).
3. Code is case-insensitive; generate it in UPPERCASE; the page uppercases while typing and accepts both.
4. QR code in the playout that opens the page already "logged in" (code inside the link).
5. Several addresses exist: cards per address in the app (the neutral in-LAN page is out of scope for now).

## Decisions
- Code: 8 chars from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no I/O/0/1). New code on every **Start web monitor**
  (setting "Keep the same code between sessions", default off). Server compares `toUpper()`; page `input` has
  `text-transform:uppercase` + `value.toUpperCase()` before sending. Throttling of wrong codes stays.
  Files: `web_monitor.cpp` (generateCode, code check), `web/monitor.html` (login field), `main_web.inc` (start flow).
- Footer pill "Web n" next to NDI/OMT (`refreshDashboard`/footer status): grey = off, accent = running,
  text = viewers count; tooltip with the primary address. Uses `web_->running()`/`viewers()`.
- QR: vendor Nayuki "QR Code generator" (MIT, `qrcodegen.hpp/.cpp`, ~1k lines) into `src/third_party/`, add
  notice to `packaging/notices`. Render to QImage (black on white, quiet zone 4) in the Web monitor page, 220 px,
  plus "Copy link" and "Save QR" buttons. Also usable later for Mizin Link control stations.
- Which address in the QR: the QR must work offline on the event LAN, so it encodes the **direct link** of the
  primary address (`http://IP:port/?k=CODE`), primary = IPv4 of the interface with the default route (fallback:
  first private address). A combo above the QR lists every address as cards (name of the adapter + IP); choosing one
  regenerates the QR. This solves "if the first fails, try the next" without needing internet.
- Neutral landing page (in-LAN, cards per address): left out by the owner (2026-10-25). The QR is the direct link
  of the chosen address; the address cards live in the app above the QR.
- Page after scan: the monitor page already reads `?k=`; it should then `history.replaceState` to drop the code from
  the address bar (so screenshots/shared links do not leak it) and keep it in sessionStorage.

## Tests to add (`--web-test`)
- new code per start; old code 403 after restart; lowercase code accepted; generated code uppercase/alphabet.
- QR decodes back to the exact link (decode with the same library's test vectors or check module matrix size/ECC).
- footer pill text reflects viewers (UI test).

## Docs/site
Quick-start + F1 + tutorial step "Web monitor": scan the QR; code changes every start; site shot of the panel with QR.
