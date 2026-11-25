// Minimal OSC packet sender for the Wire-plugin "heartbeat" pulse.
//
// Byte-for-byte reconstruction of Local.Osc() in the earlier C# Manager.cs:
// an OSC message with address "/mizin/wire/{product}/{release}[/{channel}]",
// type tag ",f" (single float32 argument), and a fixed float32 payload of
// 1.0 (big-endian 0x3F800000, i.e. bytes 63,128,0,0 at the 4-byte-aligned
// offset right after the type-tag block). Resolume's "Read OSC" node
// (see manager/make-probe.ps1) only cares that *a* message arrives on the
// address within its Attack/Release window -- the float value itself is
// unused by the generated watermark-suppression graph, so matching the
// legacy byte layout exactly is about protocol compatibility with any
// third-party patch that *does* read the float, not about this app's own
// graphs.
#pragma once

#include <winsock2.h>
#include <ws2tcpip.h>
#include <string>
#include <vector>
#include <cstdint>

#pragma comment(lib, "ws2_32.lib")

namespace plugnex {

class OscSender {
public:
    OscSender() {
        WSADATA wsa;
        ok_ = (WSAStartup(MAKEWORD(2, 2), &wsa) == 0);
        if (ok_) {
            socket_ = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
            ok_ = (socket_ != INVALID_SOCKET);
        }
    }

    ~OscSender() {
        if (socket_ != INVALID_SOCKET) closesocket(socket_);
        if (ok_) WSACleanup();
    }

    OscSender(const OscSender&) = delete;
    OscSender& operator=(const OscSender&) = delete;

    bool isReady() const { return ok_ && socket_ != INVALID_SOCKET; }

    // Sends one pulse to 127.0.0.1:port for "/mizin/wire/{product}/{release}[/{channel}]".
    // Returns false on any socket-level failure; callers surface this the
    // way Manager.cs's timer tick caught SocketException ("Porta OSC indisponível.").
    bool sendPulse(const std::string& product, const std::string& release, const std::string& channel, uint16_t port) {
        if (!isReady()) return false;
        std::string address = "/mizin/wire/" + product + "/" + release;
        if (!channel.empty()) address += "/" + channel;

        std::vector<uint8_t> packet = buildMessage(address);

        sockaddr_in dest{};
        dest.sin_family = AF_INET;
        dest.sin_port = htons(port);
        dest.sin_addr.s_addr = htonl(INADDR_LOOPBACK);

        int sent = sendto(socket_, reinterpret_cast<const char*>(packet.data()), static_cast<int>(packet.size()), 0,
                           reinterpret_cast<sockaddr*>(&dest), sizeof(dest));
        return sent == static_cast<int>(packet.size());
    }

private:
    static std::vector<uint8_t> buildMessage(const std::string& address) {
        // OSC address string: null-terminated, padded to a 4-byte boundary.
        size_t addrPadded = ((address.size() + 1 + 3) / 4) * 4;
        // Type tag block ",f": comma + 'f' + null + pad -> always 4 bytes here.
        // Float argument: 4 bytes, big-endian IEEE-754 for 1.0.
        std::vector<uint8_t> packet(addrPadded + 8, 0);
        memcpy(packet.data(), address.data(), address.size());
        // packet[address.size()] is already 0 (null terminator); rest of
        // padding is already zero-initialized.
        size_t tagOffset = addrPadded;
        packet[tagOffset] = ',';
        packet[tagOffset + 1] = 'f';
        packet[tagOffset + 2] = 0;
        packet[tagOffset + 3] = 0;
        // Big-endian bytes of float32(1.0) = 0x3F800000. The original C#
        // source (Local.Osc in Manager.cs) writes this via
        // bytes[pad]=44 (','), bytes[pad+1]=102 ('f'), bytes[pad+4]=63,
        // bytes[pad+5]=128 against a zero-initialized array -- i.e. only
        // the top two bytes of the big-endian float are set explicitly,
        // which is exactly 0x3F800000's non-zero bytes; the bottom two
        // stay at their zero-initialized default. Reproduced here as
        // explicit 0x3F,0x80,0x00,0x00 for clarity.
        size_t floatOffset = tagOffset + 4;
        packet[floatOffset] = 0x3F;
        packet[floatOffset + 1] = 0x80;
        packet[floatOffset + 2] = 0x00;
        packet[floatOffset + 3] = 0x00;
        return packet;
    }

    bool ok_ = false;
    SOCKET socket_ = INVALID_SOCKET;
};

} // namespace plugnex
