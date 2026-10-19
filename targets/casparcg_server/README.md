# CasparCG Server: documentary reference

Source: [CasparCG Server](https://github.com/CasparCG/server). Inspected 2026-10-19.

Background preparation before TAKE (LOADBG/PLAY); independent channels and consumers; optional automatic advance; configurable transitions and SEEK/LENGTH. GPU compositing is a separate capability from hardware video decoding.

The source repository declares GPL licensing. This research collects public documentation and license texts only. No implementation code was imported into Mizin Playout. UI and transport implementation are original, in `../mizin_playout/reconstructed/`.

## Evidence

`evidence/sources.json` records original URLs, retrieval time and SHA-256 for each collected document. No application binary was downloaded, executed or decompiled in this pass. `binaries/SHA256SUMS.txt` records that boundary. REA/Ghidra were not needed for documentary research.

## Estado Atual e Próximos Passos

Documentary collection complete. Concepts were compared with native Mizin Playout. Future work: evaluate continuity policies and remote-control design against operational needs. Documentation does not prove runtime behavior or performance.
