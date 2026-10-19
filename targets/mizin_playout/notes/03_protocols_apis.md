# Local project and remote boundary

Schema 1 .mizinshow: JSON with library, playlist and folders string arrays. Save uses QSaveFile for an atomic commit. Open validates JSON, schema and string-array types before replacing the current list. Media originals are referenced, never deleted.

No HTTP/WebSocket/OSC listener is implemented or opened. Remote operator/observer authentication and a command/state protocol are future work; do not represent settings-page roadmap text as a working remote service.
