# ADR-009 — One Program by default; event output configuration

Historical stage: dynamic counts and independent playlists are superseded by [ADR-010](ADR-010-dynamic-programs-and-playlists.md).

The operator requested a single output as the default, enabling more only when an event needs them. A logical Program is independent content; a display route mirrors an existing Program without adding another playback channel.

## Behavior

- Every launch starts with one Program and one configured display route. Displays and NDI/OMT senders still open/start only on explicit request.
- MAIN has Preview and PROGRAM, with `+ Add Program`. B is hidden from MAIN, destination selection, audio, digital outputs and diagnostic tables until enabled.
- Outputs → Displays exposes independent Program add/remove and display-route add/remove. Capacity remains two independent Programs and three display routes. Each new route defaults to the main Program. B may then be selected for an independent route.
- Adding an idle Program or mirrored route does not stop/reload the current Program. Existing native channel objects remain allocated but B has no loaded media, decoder work or sending session until used. This is not a measured resource-allocation reduction.
- A Program with loaded/paused media, preparation, transition, visible display route or active NDI/OMT sender cannot be removed. The operator must Black B and close/stop its outputs first. An open display route cannot be removed. A minimum of one Program and one display route is enforced.
- Closing a display does not Black a Program. Source/scaling changes remain staged until Open output, consistent with the existing routing contract.

## Persistence and compatibility

Schema 3 `.mizinshow` files store Program count, display-route count and the source Program for each configured route. Schema 1/2 files retain cue metadata and migrate to one Program / one display route. Invalid configurations reject the whole show without partial mutation. A show that would remove a busy B or open route is rejected before playlist/configuration changes.

Loading a show does not open displays, choose physical endpoints, start playback or start digital senders. Physical display selection and scaling/audio preferences retain their existing behavior; this change saves route counts and Program sources, not a full hardware event profile. New launches retain the one-output default until a saved show is opened.

Diagnostic JSON keeps its existing channel/sender/route arrays and adds `enabled` flags plus `output_configuration`. The visible table hides inactive B. Unknown backend measurements remain null.

## Validation scope

Native UI checks cover single and dual MAIN in EN/PT-BR at 1600×1000 and 1280×800; route capacity/mirroring, inactive destination guards, open/live/network removal guards, preservation of running A and actual show-file save/restore. Transport checks cover schema 1/2 migration, schema 3 round trips and atomic malformed-config rejection. Native boards use labelled sample content; in-process widget captures are not physical screen or AV-sync qualification.
