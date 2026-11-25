// Offline signature verification for PLUGNEX license tokens.
//
// Two schemes are in play, both reverse-engineered from licensing.mjs /
// wire-manager.mjs in this same target (see notes/03_protocols_apis.md and
// notes/06_juicebar_resolume_integration.md):
//
//   1. Direct-activation tokens (DLL/app products), issued by
//      store.authorize() in licensing.mjs:
//        payload = base64url(JSON{v,device,product,release,issued,expires})
//        token   = payload + "." + base64url(Ed25519_sign(ASCII(payload)))
//      The server hands out its Ed25519 public key as SPKI PEM at
//      GET /api/public-key ({algorithm:"Ed25519", key: "-----BEGIN..."}).
//      We only ever need the raw 32-byte point, which is the last 32 bytes
//      of the 44-byte SPKI DER (fixed 12-byte prefix for Ed25519 SPKI,
//      verified empirically against Node's own output during this build).
//
//   2. Wire proofs (Wire plugin editions), issued by wireManager().grant()
//      in wire-manager.mjs:
//        payload   = base64(JSON{...claims, scope:"mizin-wire", licenseId, channel})
//        signature = base64(ECDSA_P256_sign(SHA256(ASCII(payload)), ieee-p1363))
//      The server's public key is a 72-byte CNG BCRYPT_ECCKEY_BLOB-style
//      blob (magic "ECS1" + cbKey=32 + X[32] + Y[32]) exposed as base64 at
//      GET /api/wire/issuer ({publicBlob}). This is intentionally the exact
//      same blob format Manager.cs/ManagerPanel.cs already consumed via
//      CngKey.Import(..., CngKeyBlobFormat.EccPublicBlob), so this client
//      recognizes the same production keys without re-provisioning.
//
// Verification failing closed (returning false/empty) on any malformed
// input is the explicit security property we're matching from
// licensing.mjs's verifyOffline(): a parse error is not a pass.
#pragma once

#include <windows.h>
#include <bcrypt.h>
#include <wincrypt.h>
#include <string>
#include <vector>
#include <optional>
#include <cstdint>

#include "../vendor/json.hpp"
#include "../vendor/ed25519/ed25519.h"

#pragma comment(lib, "bcrypt.lib")
#pragma comment(lib, "crypt32.lib")

namespace plugnex::crypto {

// --- base64 / base64url -----------------------------------------------

inline std::vector<uint8_t> base64Decode(std::string s, bool urlSafe) {
    if (urlSafe) {
        for (char& c : s) { if (c == '-') c = '+'; else if (c == '_') c = '/'; }
        while (s.size() % 4 != 0) s.push_back('=');
    }
    DWORD outLen = 0;
    if (!CryptStringToBinaryA(s.c_str(), static_cast<DWORD>(s.size()), CRYPT_STRING_BASE64,
                               nullptr, &outLen, nullptr, nullptr) || outLen == 0) {
        return {};
    }
    std::vector<uint8_t> out(outLen);
    if (!CryptStringToBinaryA(s.c_str(), static_cast<DWORD>(s.size()), CRYPT_STRING_BASE64,
                               out.data(), &outLen, nullptr, nullptr)) {
        return {};
    }
    out.resize(outLen);
    return out;
}

// --- Ed25519 direct-activation tokens -----------------------------------

struct DirectClaims {
    int v = 0;
    std::string device, product, release;
    int64_t issued = 0, expires = 0;
};

// Extracts the raw 32-byte Ed25519 public point from the server's SPKI PEM
// (as returned by GET /api/public-key). Returns empty on any mismatch so
// callers fail closed rather than trusting a malformed/foreign key.
inline std::optional<std::vector<uint8_t>> ed25519RawFromSpkiPem(const std::string& pem) {
    const std::string beginTag = "-----BEGIN PUBLIC KEY-----";
    const std::string endTag = "-----END PUBLIC KEY-----";
    size_t begin = pem.find(beginTag);
    size_t end = pem.find(endTag);
    if (begin == std::string::npos || end == std::string::npos || end <= begin) return std::nullopt;
    std::string body = pem.substr(begin + beginTag.size(), end - (begin + beginTag.size()));
    std::string b64;
    for (char c : body) if (!isspace(static_cast<unsigned char>(c))) b64.push_back(c);
    auto der = base64Decode(b64, false);
    // Ed25519 SPKI DER is a fixed 12-byte ASN.1 prefix followed by the raw 32-byte point.
    if (der.size() != 44) return std::nullopt;
    static const uint8_t expectedPrefix[12] = {0x30,0x2a,0x30,0x05,0x06,0x03,0x2b,0x65,0x70,0x03,0x21,0x00};
    if (memcmp(der.data(), expectedPrefix, 12) != 0) return std::nullopt;
    return std::vector<uint8_t>(der.begin() + 12, der.end());
}

// Mirrors licensing.mjs's verifyOffline(): verifies the Ed25519 signature
// over the ASCII bytes of the base64url payload, then checks product,
// release, device-binding and the issued/expires window. `nowMs` is
// injectable for testing, defaulting to the real clock.
inline std::optional<DirectClaims> verifyDirectToken(const std::string& token,
                                                       const std::vector<uint8_t>& ed25519PublicKey,
                                                       const std::string& expectedDevice,
                                                       const std::string& expectedProduct,
                                                       const std::string& expectedRelease,
                                                       int64_t nowMs) {
    if (ed25519PublicKey.size() != 32) return std::nullopt;
    size_t dot = token.find('.');
    if (dot == std::string::npos) return std::nullopt;
    std::string payloadB64 = token.substr(0, dot);
    std::string sigB64 = token.substr(dot + 1);
    auto sig = base64Decode(sigB64, true);
    if (sig.size() != 64) return std::nullopt;
    // The server signs the ASCII *text* of the base64url payload, not the
    // decoded bytes (see sign(null, Buffer.from(payload), ...) in
    // licensing.mjs -- Buffer.from(string) on a plain string is UTF-8/ASCII
    // here since base64url is already ASCII-safe).
    const uint8_t* message = reinterpret_cast<const uint8_t*>(payloadB64.data());
    if (!ed25519_verify(sig.data(), message, payloadB64.size(), ed25519PublicKey.data())) {
        return std::nullopt;
    }
    auto payloadBytes = base64Decode(payloadB64, true);
    if (payloadBytes.empty()) return std::nullopt;
    nlohmann::json j;
    try {
        j = nlohmann::json::parse(std::string(payloadBytes.begin(), payloadBytes.end()));
    } catch (...) {
        return std::nullopt;
    }
    DirectClaims c;
    try {
        c.v = j.value("v", 0);
        c.device = j.value("device", std::string());
        c.product = j.value("product", std::string());
        c.release = j.value("release", std::string());
        c.issued = j.value("issued", (int64_t)-1);
        c.expires = j.value("expires", (int64_t)-1);
    } catch (...) {
        return std::nullopt;
    }
    if (c.v != 1) return std::nullopt;
    if (c.device != expectedDevice) return std::nullopt;
    if (c.product != expectedProduct) return std::nullopt;
    if (c.release != expectedRelease) return std::nullopt;
    if (c.issued < 0 || c.expires < 0) return std::nullopt;
    if (c.issued > nowMs) return std::nullopt;
    if (nowMs >= c.expires) return std::nullopt;
    return c;
}

// --- P-256 Wire proofs (CNG), matching Manager.cs's Local.Check() ------

struct WireClaims {
    int v = 0;
    std::string scope, product, release, device, licenseId, channel;
    int64_t issued = 0, expires = 0;
};

// Decodes the 72-byte CNG blob (magic "ECS1" + cbKey + X + Y) from
// GET /api/wire/issuer's base64 `publicBlob` into a BCRYPT_ECCKEY_BLOB the
// way CngKey.Import(..., EccPublicBlob) consumed it on the C# side.
inline std::optional<std::vector<uint8_t>> decodeWirePublicBlob(const std::string& publicBlobBase64) {
    auto blob = base64Decode(publicBlobBase64, false);
    if (blob.size() != 72) return std::nullopt;
    static const uint8_t magic[4] = {0x45,0x43,0x53,0x31}; // "ECS1" = BCRYPT_ECDSA_PUBLIC_P256_MAGIC, little-endian bytes of 0x31534345
    if (memcmp(blob.data(), magic, 4) != 0) return std::nullopt;
    uint32_t cbKey = 0;
    memcpy(&cbKey, blob.data() + 4, 4);
    if (cbKey != 32) return std::nullopt;
    return blob;
}

inline bool cngVerifyP256(const std::vector<uint8_t>& eccBlob, const uint8_t* message, size_t messageLen,
                           const uint8_t* signature, size_t signatureLen) {
    if (signatureLen != 64) return false; // ieee-p1363 raw r||s for P-256
    BCRYPT_ALG_HANDLE alg = nullptr;
    if (BCryptOpenAlgorithmProvider(&alg, BCRYPT_ECDSA_P256_ALGORITHM, nullptr, 0) != 0) return false;
    BCRYPT_KEY_HANDLE key = nullptr;
    NTSTATUS status = BCryptImportKeyPair(alg, nullptr, BCRYPT_ECCPUBLIC_BLOB, &key,
                                           const_cast<PUCHAR>(eccBlob.data()), static_cast<ULONG>(eccBlob.size()), 0);
    if (status != 0) { BCryptCloseAlgorithmProvider(alg, 0); return false; }

    // SHA-256 the message first (wire-manager.mjs signs with algorithm
    // 'sha256' over the payload bytes, so BCryptSignHash/VerifySignature
    // must be given the digest, not the raw message).
    uint8_t digest[32];
    BCRYPT_ALG_HANDLE hashAlg = nullptr;
    bool ok = false;
    if (BCryptOpenAlgorithmProvider(&hashAlg, BCRYPT_SHA256_ALGORITHM, nullptr, 0) == 0) {
        if (BCryptHash(hashAlg, nullptr, 0, const_cast<PUCHAR>(message), static_cast<ULONG>(messageLen), digest, sizeof(digest)) == 0) {
            NTSTATUS verifyStatus = BCryptVerifySignature(key, nullptr, digest, sizeof(digest),
                                                           const_cast<PUCHAR>(signature), static_cast<ULONG>(signatureLen), 0);
            ok = (verifyStatus == 0);
        }
        BCryptCloseAlgorithmProvider(hashAlg, 0);
    }
    BCryptDestroyKey(key);
    BCryptCloseAlgorithmProvider(alg, 0);
    return ok;
}

// Mirrors Manager.cs's Local.Check(): verifies the P-256 signature over the
// standard-base64 payload text, decodes the claims, and checks scope,
// product/release/licenseId binding, device hash and the time window.
inline std::optional<WireClaims> verifyWireProof(const std::string& payloadB64, const std::string& signatureB64,
                                                   const std::vector<uint8_t>& eccBlob,
                                                   const std::string& expectedProduct, const std::string& expectedRelease,
                                                   const std::string& expectedLicenseId, const std::string& expectedDevice,
                                                   int64_t nowMs) {
    auto signature = base64Decode(signatureB64, false);
    if (signature.size() != 64) return std::nullopt;
    const uint8_t* message = reinterpret_cast<const uint8_t*>(payloadB64.data());
    if (!cngVerifyP256(eccBlob, message, payloadB64.size(), signature.data(), signature.size())) {
        return std::nullopt;
    }
    auto payloadBytes = base64Decode(payloadB64, false);
    if (payloadBytes.empty()) return std::nullopt;
    nlohmann::json j;
    try {
        j = nlohmann::json::parse(std::string(payloadBytes.begin(), payloadBytes.end()));
    } catch (...) {
        return std::nullopt;
    }
    WireClaims c;
    try {
        c.v = j.value("v", 0);
        c.scope = j.value("scope", std::string());
        c.product = j.value("product", std::string());
        c.release = j.value("release", std::string());
        c.device = j.value("device", std::string());
        c.licenseId = j.value("licenseId", std::string());
        c.channel = j.value("channel", std::string());
        c.issued = j.value("issued", (int64_t)-1);
        c.expires = j.value("expires", (int64_t)-1);
    } catch (...) {
        return std::nullopt;
    }
    if (c.v != 1) return std::nullopt;
    if (c.scope != "mizin-wire") return std::nullopt; // wire protocol constant kept server-side; see notes/06
    if (c.product != expectedProduct) return std::nullopt;
    if (c.release != expectedRelease) return std::nullopt;
    if (c.licenseId != expectedLicenseId) return std::nullopt;
    if (c.device != expectedDevice) return std::nullopt;
    if (c.issued < 0 || c.expires < 0) return std::nullopt;
    if (c.issued > nowMs) return std::nullopt;
    if (nowMs >= c.expires) return std::nullopt;
    return c;
}

// SHA-256 hex digest, matching licensing.mjs's digest() used for both the
// installationKey -> device binding and the Wire licenseId derivation.
inline std::string sha256Hex(const std::string& input) {
    BCRYPT_ALG_HANDLE alg = nullptr;
    std::string result;
    if (BCryptOpenAlgorithmProvider(&alg, BCRYPT_SHA256_ALGORITHM, nullptr, 0) != 0) return result;
    uint8_t digest[32];
    if (BCryptHash(alg, nullptr, 0, (PUCHAR)input.data(), (ULONG)input.size(), digest, sizeof(digest)) == 0) {
        static const char* hex = "0123456789abcdef";
        result.resize(64);
        for (int i = 0; i < 32; i++) {
            result[i*2] = hex[digest[i] >> 4];
            result[i*2+1] = hex[digest[i] & 0xF];
        }
    }
    BCryptCloseAlgorithmProvider(alg, 0);
    return result;
}

// Generates a cryptographically random 32-byte installation key, hex
// encoded to 64 chars -- the format licensing.mjs's authorize() requires
// (/^[a-f0-9]{64}$/) and the one piece of local secret state the whole
// offline-trust chain is anchored on. Matches Local.Load()'s use of
// RandomNumberGenerator in Manager.cs.
inline std::string generateInstallationKey() {
    uint8_t bytes[32];
    BCRYPT_ALG_HANDLE alg = nullptr;
    if (BCryptOpenAlgorithmProvider(&alg, BCRYPT_RNG_ALGORITHM, nullptr, 0) != 0) return "";
    BCryptGenRandom(alg, bytes, sizeof(bytes), 0);
    BCryptCloseAlgorithmProvider(alg, 0);
    static const char* hex = "0123456789abcdef";
    std::string result(64, '0');
    for (int i = 0; i < 32; i++) {
        result[i*2] = hex[bytes[i] >> 4];
        result[i*2+1] = hex[bytes[i] & 0xF];
    }
    return result;
}

} // namespace plugnex::crypto
