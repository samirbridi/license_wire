# Native interface — Live Desk multiview

The user approved Live Desk A and logo A, then requested all-Program multiview, complete Program listings in Outputs, NDI / OMT naming and spacing/alignment corrections. One Program / one route remains the default. Extra Programs form a responsive grid beside muted Preview. Click a tile name to select its playlist/TAKE destination; play/pause/Black belong to that tile. Extra rows scroll for larger configurations. Selection does not stop other Programs.

Outputs lists every Program with its playlist count and configured route numbers. A source without a screen remains listed. Per-Program Add route creates an assigned, closed route; the global Add display output defaults to A for mirroring. No sender/window starts automatically.

The 31 current samples from **v0.11.1 (build 0030)** contain 12 default boards, 2 compact default MAIN boards, 12 three-Program/five-route boards, and 5 five-Program boards (MAIN EN/PT at 1600x1000 and 1280x800 plus Outputs EN). Art, READY and meters are labelled samples. Real widget evidence is separate; QWidget::render may omit hardware surfaces and does not prove physical signals.

[Five Programs](boards/five-programs/01-main-en.png), [compact PT-BR](boards/five-programs/compact/04-main-pt-BR.png), [all Programs in Outputs](boards/five-programs/02-outputs-en.png), [review](REVIEW.md). Logo vectors and original approval boards are retained; previous build-0028 boards/package are preserved in binaries/preserved/build-0028/.

Capture full default/multi boards with scripts/capture-boards.ps1. For the five-Program samples use the executable flags --board --board-programs 5 --lang en or pt-BR --capture-dir <folder>; --capture-size 1280x800 selects compact size. Per-tab Outputs scrolling keeps display routing independent from the network panels' height.
