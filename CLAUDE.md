# CLAUDE.MD - WORKSPACE INSTRUCTIONS FOR CLAUDE CODE

See [AGENTS.md](AGENTS.md) for full workspace conventions and reverse engineering rules.

## Quick Summary for Claude Code:
1. **Target Isolation**: All targets live under `targets/<target-name>/`. NEVER mix files across different target directories.
2. **Tools**:
   - Use REA (`npx -y rea-agents`) for analyzing JavaScript/Electron, APKs, Binaries, CDP, etc.
   - Use Ghidra for native binary decompilation and analysis.
3. **Target Structure**:
   - Every target has `README.md`, `CHANGELOG.md`, `VERSION`, `binaries/`, `evidence/`, `notes/`, `scripts/`, `reconstructed/`.
4. **Versioning & Changelog**:
   - Version format: `vX.Y.Z (build XXXX)`
   - Mandatory commits: `feat:`, `fix:`, `improve:`, `perf:`, `refactor:`, `break:`
   - Keep target `CHANGELOG.md` updated with every analyzed feature or discovery.
5. **Continuity**: Leave detailed notes in `targets/<target-name>/notes/` so Antigravity or Codex can seamlessly pick up where you left off.
