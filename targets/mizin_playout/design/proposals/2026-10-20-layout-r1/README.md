# Layout proposals — MAIN / revision 1

Date: 2026-10-20
Status: **Direction A — Live Desk approved by the user.**
Application baseline: **v0.7.3 (build 0020)**.

These are three generated static design mockups for comparison. They are not captures of an implemented interface. No application changes or builds were made during their generation. The subsequent native implementation follows [the user's selection of A](../../APPROVAL.md).

## Compare the directions

| Proposal | Main idea | Best fit | Tradeoff |
| --- | --- | --- | --- |
| [A — Live Desk](A-live-desk.png) | Preview and Program A have prominent monitors, Program B remains visible, with a shared table and a horizontal take strip. | Familiar general operation and detailed running-order review. | Program B receives less space than Program A. |
| [B — Dual Program](B-dual-program.png) | Programs A and B have equal monitor sizes. Preview and take controls occupy a persistent right column. | Frequent operation of independent content on two programs. | Preview and the running-order table receive less space. |
| [C — Stage Focus](C-stage-focus.png) | Vertical cue cards, a large main Program monitor, and stacked Preview / Program B. | Events and shows with a principal screen and quick access to the next cue. | Less tabular information fits in the running-order view. |

**Selected direction: A — Live Desk.** B and C are retained for comparison.

## Preserved requirements

- MAIN, EDIT, Library, Outputs, Audio and Settings; editing remains separate.
- Muted Preview and distinct Programs A/B.
- Explicit take destination, CUT, FADE and a default duration of 300 ms.
- In/Out, cue transitions, manual/sequential playback, repeat order, loop and black.
- Files/folder intake, running-order access and cue editing.
- Access to physical output routing, digital NDI/OMT output settings and audio configuration.
- English as the default interface language; the existing Brazilian Portuguese option remains a requirement.

Physical routes, stage images, playback times and audio meters are illustrative. They do not demonstrate connected displays, network transmission, device detection or measured playback performance. NDI/OMT are deliberately depicted as stopped. Controls shown on MAIN propose organization and quick access; they do not add engine functionality.

## Review boundary

The user selected A and requested continuation. Apply the A organization in native Qt, preserving engine functions. Final native rendering still needs to be shown for review.

Generated raster images are approval material only. Rebuild the chosen interface using native widgets and verified labels; do not use these screenshots as UI textures or treat generated icon/text details as a final specification. Confirm actual monitor sizing, focus behavior, cue actions and full EN/PT-BR coverage when implementing the selected direction.

## Verification and provenance

- Three PNGs were visually reviewed for distinct composition and the main operational controls.
- Each image is copied without modifying the generated original.
- Dimensions, byte sizes and SHA-256 values are in [manifest.json](manifest.json).
- Generation mode: built-in imagegen. Complete prompts are in [PROMPTS.md](PROMPTS.md).
- Functional reference: [existing native MAIN board](../../boards/01-main-en.png). No third-party product screenshots are included.
- No compilation, application version increment or release was performed for this image-only review.

## Estado Atual e Próximos Passos

Modelo A selecionado pelo usuário. Implementar a direção Live Desk e apresentar novas capturas nativas para avaliação do resultado.
