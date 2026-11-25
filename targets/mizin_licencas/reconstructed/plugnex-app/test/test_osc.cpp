// Verifies OscSender produces byte-identical packets to the original C#
// Local.Osc() in Manager.cs, by sending a real UDP packet to a loopback
// listener and comparing bytes against an independently-computed
// reference built the same way the C# source built it (not via osc.h's
// own logic, to avoid testing the implementation against itself).
#include <winsock2.h>
#include <ws2tcpip.h>
#include <iostream>
#include <vector>
#include <cstring>
#include "../src/osc.h"

#pragma comment(lib, "ws2_32.lib")

static int failures = 0;
#define CHECK(cond, msg) do { if (!(cond)) { std::cerr << "FAIL: " << msg << " (line " << __LINE__ << ")\n"; failures++; } else { std::cout << "ok: " << msg << "\n"; } } while(0)

// Independent reference implementation, transcribed directly from
// Local.Osc() in Manager.cs (address+pad logic, byte offsets for ',','f'
// and the two non-zero float bytes), to cross-check osc.h without reusing
// its code.
static std::vector<uint8_t> referenceOsc(const std::string& product, const std::string& release, const std::string& channel) {
    std::string address = "/mizin/wire/" + product + "/" + release;
    if (!channel.empty()) address += "/" + channel;
    int pad = (static_cast<int>(address.size()) + 4) & ~3;
    std::vector<uint8_t> bytes(pad + 8, 0);
    memcpy(bytes.data(), address.data(), address.size());
    bytes[pad] = 44;      // ','
    bytes[pad + 1] = 102; // 'f'
    bytes[pad + 4] = 63;  // 0x3F
    bytes[pad + 5] = 128; // 0x80
    return bytes;
}

int main() {
    WSADATA wsa;
    if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) { std::cerr << "WSAStartup failed\n"; return 1; }

    SOCKET listener = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
    CHECK(listener != INVALID_SOCKET, "created UDP listener socket");

    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(17890); // arbitrary free-ish test port
    addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    CHECK(bind(listener, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) == 0, "bound listener to 127.0.0.1:17890");

    DWORD timeout = 2000;
    setsockopt(listener, SOL_SOCKET, SO_RCVTIMEO, reinterpret_cast<const char*>(&timeout), sizeof(timeout));

    {
        plugnex::OscSender sender;
        CHECK(sender.isReady(), "OscSender initialized");
        bool sent = sender.sendPulse("outliner", "wire-preview-1", "deadbeefdeadbeefdeadbeefdeadbeef", 17890);
        CHECK(sent, "sendPulse reported success");
    }

    std::vector<uint8_t> buffer(512);
    int received = recv(listener, reinterpret_cast<char*>(buffer.data()), static_cast<int>(buffer.size()), 0);
    CHECK(received > 0, "listener received a UDP packet");

    if (received > 0) {
        buffer.resize(received);
        auto expected = referenceOsc("outliner", "wire-preview-1", "deadbeefdeadbeefdeadbeefdeadbeef");
        CHECK(buffer.size() == expected.size(), "received packet length matches reference");
        CHECK(buffer == expected, "received packet bytes match independently-built reference exactly");

        // Also spot-check the human-readable address prefix landed correctly.
        std::string asText(buffer.begin(), buffer.begin() + std::min<size_t>(buffer.size(), 48));
        CHECK(asText.find("/mizin/wire/outliner/wire-preview-1/deadbeef") == 0, "OSC address string is well-formed");
    }

    // Channel-less form (direct DLL activation never has a channel segment).
    {
        plugnex::OscSender sender;
        sender.sendPulse("playout", "preview-1", "", 17890);
    }
    std::vector<uint8_t> buffer2(512);
    int received2 = recv(listener, reinterpret_cast<char*>(buffer2.data()), static_cast<int>(buffer2.size()), 0);
    CHECK(received2 > 0, "listener received the channel-less packet");
    if (received2 > 0) {
        buffer2.resize(received2);
        auto expected2 = referenceOsc("playout", "preview-1", "");
        CHECK(buffer2 == expected2, "channel-less packet matches reference exactly");
    }

    closesocket(listener);
    WSACleanup();

    std::cout << "\n" << (failures == 0 ? "ALL PASS" : "FAILURES: " + std::to_string(failures)) << "\n";
    return failures == 0 ? 0 : 1;
}
