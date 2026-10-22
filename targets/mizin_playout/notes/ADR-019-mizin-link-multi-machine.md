# ADR-019 — Mizin Link: several playout machines working as one

Date: 2026-10-22. Status: accepted by the owner (all four scenarios, events with 5+ machines);
phase 1 shipped in build 0054, phase 2 in 0055, phases 3 and 4 together in 0057 (0056 passed its build but was not published: host audio gate; see notes below).

## Scenarios (owner request)
1. **Main + backup**: a backup follows everything the main does (show, playlists, takes, position) so
   it can take over the screens if the main fails.
2. **Several PCs playing together**: each PC feeds part of an LED wall or its own screens; all play the
   same timeline in sync, commanded by one master.
3. **Show distribution**: send show + media from the main PC to the others over the network, verified.
4. **Remote control**: an operator station commands a playout machine over the network, with login
   and permissions.

## Architecture
- One **master** per Link group; any number of **followers** (backups, wall nodes) and, later,
  **control stations**. A follower can be promoted to master.
- **Discovery**: UDP broadcast announce on port 47800 every second (name, role, version, ports, show
  name). No secrets in announces.
- **Pairing/authentication**: a Link code (like the web monitor code) is entered on every machine. The
  key is derived from it; the TCP session starts with a challenge (master nonce → HMAC-SHA256), and every
  message carries an HMAC with a sequence number, so a stranger on the LAN cannot command or replay.
  Integrity, not secrecy: LAN-only, no Internet exposure.
- **Clock**: NTP-style ping/pong over the session (TCP_NODELAY), min-RTT filtered offset; target < 1 ms
  on wired LAN. All commands carry a master-time execution instant (lead ≈ 100–150 ms) so every node acts
  at the same moment.
- **Show + media distribution** (phase 1): master publishes the show (relative paths, as in the show
  package) and a media manifest (relative path, size, SHA-256; hashes cached by path+size+mtime). Followers
  download missing/different files over an authenticated file port, verify SHA-256, store them in
  `<profile>/link-media/<show>/media/`, then load the show.
- **Mirroring / sync playback** (phases 2–3): master sends transport events (cue, CUT/FADE, play/pause,
  black, seek, sequential advance) scheduled in master time; followers apply them to their own Programs and
  continuously compare position with the master timeline: > 2 frames → seek, smaller → gentle correction.
  Honest target: ±1 frame on a wired LAN with identical media; this is software sync, not genlock.
  Wall nodes can crop/scale their outputs to their part of the canvas.
- **Failover** (phase 2): heartbeats every 250 ms. The backup shows MASTER LOST and keeps playing on its
  own clock; promotion to master is one click (automatic optional). Physical output switching (matrix /
  switcher) stays external.
- **Remote control** (phase 4): a control station connects with operator or viewer permission and sends
  the same commands the local desk produces; the playout machine stays authoritative.

## Phases
1. Link core: discovery, pairing, clock, show + media distribution, Link page in Outputs. ← now
2. Main + backup mirroring with heartbeat/MASTER LOST/promotion.
3. Synchronized multi-PC playback with per-node output crop for LED walls; drift measurement.
4. Remote control station with permissions.

## Validation
In-process loopback (master + several followers in one test process) for protocol, auth/replay,
clock offset, manifest/download/verification and resume; then real LAN with the owner's machines
(5+), measuring clock offset, sync drift over 30 min and failover time.

## Phase 2 notes (main + backup)
- State-driven mirroring (idempotent): the master sends every Program's state ~10x/s (media as manifest-relative
  path, active cue JSON, activeGeneration as take serial, playing/pending, position sampled on the master clock).
  A follower with "Mirror the master" and the received show (same revision) loaded applies it: new serial ->
  loadCue of the same cue (CUT/FADE parameters preserved); play/pause and loop follow; empty media -> black;
  position error > 80 ms -> seek (1 s cooldown per Program). Follower controllers are forced to manual.
- MASTER LOST: no state for 1.5 s or session closed -> red banner, playback continues; "Take over as master"
  restarts Link as master with the same code and republishes the show.
- Bug fixed on the way: QJsonObject::operator[] in announce() inserted an empty "name" into the master manifest,
  so early followers received an empty show. Manifests are now only sent after publication and followers reject
  incomplete ones.
- Measured (two MainWindows, one computer, loopback): position drift 43–64 ms after correction; all mirroring and
  failover checks pass (`--link-mirror-test`). Multi-computer LAN measurement pending.

## Phase 3 notes (several PCs playing together)
- "Synchronized takes" (master option, active when followers are connected and a show was published): CUT/FADE
  prepare the cue locally and broadcast a `take` message {Program id, cue with manifest-relative path, serial,
  atUs = master clock + 400 ms}. Every mirroring follower prepares the same cue and calls takePrepared() at
  atUs converted to its own clock; if preparation is late it fires as soon as it is ready. State-driven mirroring
  for that Program is held back until the take ran, so the 10 Hz state cannot race the scheduled take.
- Fine sync while the master is in sync mode: |error| <= 8 ms -> speed 1.0; up to 250 ms -> speed
  1 - clamp(error/500, ±5%); beyond 250 ms -> seek (1 s cooldown). Speed returns to 1.0 on every take and pause.
  Followers report their absolute drift in the Link status; the master's table shows it.
- Per-display AREA (output crop): the output window enlarges and offsets its video surface so only the normalized
  region is visible (no extra copy; Native and GPU Lanczos fill the region without letterbox). Presets for halves,
  thirds and quarters plus custom X/Y/W/H in %. Stored per route in settings (outputArea/outputRegion).
- Validation: `--link-mirror-test` adds synchronized-take, drift-hold, follower-drift-report and crop checks
  (two MainWindows, loopback). Real multi-PC LAN measurement still pending.

## Phase 4 notes (remote control)
- New role "Control station". It joins with the Link code (session MAC as for followers) and, in `auth`, sends the
  operator name plus proof = HMAC(SHA256("mizin-link-operator-v1|code|PIN"), session nonce). The PIN never travels.
  Unknown operator or wrong proof -> `denied` and the session closes; the station stops auto-reconnecting.
- Operators live on the master (settings `link/operators`): name, PIN, level operator|viewer, Program ids (empty = all).
  Changing a PIN or removing an operator signs its station out immediately.
- The master sends control stations a `desk` 4x/s (Programs, playlist item names, current row, media, position,
  playing) with the station's level and allowed Programs; stations never receive the show, media, state or takes.
- Commands (`cut`, `fade` with row + fade ms, `black`, `pause`, `play`) are validated against the operator again on
  every command, executed by the playout machine as local takes (synchronized takes when active, so backups and
  wall nodes follow) and answered with `ack`; each one is appended to `<profile>/link/remote-log.txt`.
- Validation: `--link-test` covers sign-in, wrong PIN, per-operator permissions in the desk, command enforcement and
  sign-out on PIN change; `--link-mirror-test` drives a real control-station window commanding the master while the
  backup mirrors it. Real multi-PC LAN validation still pending.
