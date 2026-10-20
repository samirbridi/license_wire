#pragma once
#include "playlist.hpp"
#include "network.hpp"

// Extra Programs are allocated only on explicit add / show load. Mirrors reuse a Program.
struct ProgramRuntime final {
    int id;
    NativeChannel channel{false};
    PlaylistController controller{&channel};
    NetworkBus network{&channel};
    explicit ProgramRuntime(int stableId):id(stableId){}
};
