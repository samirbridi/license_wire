# Implementation architecture

See ADR-001-native-engine.md. NativeChannel owns two Qt/FFmpeg decks and emits shared QVideoFrame objects. The operator and output QVideoWidgets consume those frames. Independent Programs own independent players; mirrors do not reopen media. A future compositor/clock design must be benchmarked before adding dissolves or strict synchronization.

Qt multimedia uses native libraries, not HTML video. UI uses Widgets; no WebEngine is linked. Language catalogs are compiled resources. Folder discovery runs through QtConcurrent, returning results to the UI thread.
