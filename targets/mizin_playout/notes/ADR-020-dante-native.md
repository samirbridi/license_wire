# ADR-020 — Native Dante (Audinate Dante Application Library)

Date: 2026-10-22. Status: proposed by the owner ("ter o Dante já nativo"); waiting for Audinate's terms.

## Today
- Dante reaches the playout through Dante Virtual Soundcard (DVS). In WDM mode DVS is a regular Windows device
  (Audinate FAQ: 16 x 16, eight stereo pairs) that the WASAPI engine can already use; in ASIO mode (up to 64 x 64)
  it needs the ASIO backend, which waits for the Steinberg agreement. DVS runs in one mode at a time.

## Goal
- The playout appears in Dante Controller as its own Dante device, with each Program routed to Dante transmit
  channels (2–64 at 48 kHz) and optional receive channels, without DVS.

## Path
1. Licensing: request DAL SDK access, terms, redistribution rights and naming/logo rules from Audinate (draft email
   kept privately with the other licensing documents, outside Git).
2. When the SDK arrives: a `DanteBackend` for LocalAudioEngine (same routing, sync and per-Program pairs as WASAPI),
   device name = Link machine name, channel labels = Program names, status in the Audio page.
3. Tests: loopback with Dante Controller/DVS on a second PC, latency and clock (PTP) behaviour, coexistence with DVS.
- Alternative without a license: AES67 (open standard, RTP + PTP) received by Dante devices with AES67 enabled.
  Kept as a fallback if DAL terms do not fit.

## Rules
- Nothing from the DAL SDK is committed to Git or shipped before the agreement allows it.
- No "Dante" in product names; trademark use only as Audinate's rules allow.
