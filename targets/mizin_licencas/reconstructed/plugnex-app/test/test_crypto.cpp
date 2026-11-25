// Standalone verification of crypto.h against real tokens issued by
// licensing.mjs / wire-manager.mjs (not reimplemented/mocked values).
// Run manually: see test/README.md for the fixture-generation + build steps.
#include <windows.h>
#include <iostream>
#include <fstream>
#include <sstream>
#include "../src/crypto.h"

static int failures = 0;
#define CHECK(cond, msg) do { if (!(cond)) { std::cerr << "FAIL: " << msg << " (line " << __LINE__ << ")\n"; failures++; } else { std::cout << "ok: " << msg << "\n"; } } while(0)

static std::string readFile(const std::string& path) {
    std::ifstream f(path, std::ios::binary);
    std::ostringstream ss;
    ss << f.rdbuf();
    return ss.str();
}

int main() {
    using namespace plugnex::crypto;

    // --- Ed25519 direct-token fixture, generated live from licensing.mjs ---
    auto fixtureText = readFile("ed25519_fixture.json");
    CHECK(!fixtureText.empty(), "ed25519_fixture.json loaded");
    auto fixture = nlohmann::json::parse(fixtureText);

    auto pubkey = ed25519RawFromSpkiPem(fixture["publicKeyPem"].get<std::string>());
    CHECK(pubkey.has_value() && pubkey->size() == 32, "extracted raw Ed25519 public key from SPKI PEM");

    std::string token = fixture["token"].get<std::string>();
    std::string deviceHash = fixture["deviceHash"].get<std::string>();
    std::string product = fixture["device"]["product"].get<std::string>();
    std::string release = fixture["device"]["release"].get<std::string>();
    int64_t nowMs = fixture["nowMs"].get<int64_t>();

    auto claims = verifyDirectToken(token, *pubkey, deviceHash, product, release, nowMs);
    CHECK(claims.has_value(), "verifyDirectToken accepts a genuine, current, matching token");
    if (claims) {
        CHECK(claims->product == "playout", "decoded product matches");
        CHECK(claims->release == "preview-1", "decoded release matches");
        CHECK(claims->device == deviceHash, "decoded device hash matches");
    }

    // Tampered signature must fail closed.
    std::string tampered = token;
    tampered.back() = (tampered.back() == 'A') ? 'B' : 'A';
    CHECK(!verifyDirectToken(tampered, *pubkey, deviceHash, product, release, nowMs).has_value(),
          "tampered signature is rejected");

    // Wrong product must fail closed even with a valid signature.
    CHECK(!verifyDirectToken(token, *pubkey, deviceHash, "wrong-product", release, nowMs).has_value(),
          "product mismatch is rejected");

    // Wrong device must fail closed.
    CHECK(!verifyDirectToken(token, *pubkey, std::string(64,'0'), product, release, nowMs).has_value(),
          "device mismatch is rejected");

    // Expired token (30 days + 1ms later) must fail closed.
    int64_t expiredMs = nowMs + int64_t(30) * 86400000 + 1;
    CHECK(!verifyDirectToken(token, *pubkey, deviceHash, product, release, expiredMs).has_value(),
          "expired token is rejected");

    // Future-issued token (clock skew attack) must fail closed.
    CHECK(!verifyDirectToken(token, *pubkey, deviceHash, product, release, nowMs - 1000000000LL).has_value(),
          "token from before 'issued' is rejected");

    // Wrong public key must fail closed (reject a foreign signer).
    std::vector<uint8_t> wrongKey(32, 0x42);
    CHECK(!verifyDirectToken(token, wrongKey, deviceHash, product, release, nowMs).has_value(),
          "wrong public key is rejected");

    // --- Wire P-256 proof fixture ---
    auto wireFixtureText = readFile("wire_fixture.json");
    if (!wireFixtureText.empty()) {
        auto wf = nlohmann::json::parse(wireFixtureText);
        auto eccBlob = decodeWirePublicBlob(wf["publicBlob"].get<std::string>());
        CHECK(eccBlob.has_value(), "decoded 72-byte CNG P-256 public blob");

        std::string payload = wf["proof"]["payload"].get<std::string>();
        std::string signature = wf["proof"]["signature"].get<std::string>();
        std::string wProduct = wf["product"].get<std::string>();
        std::string wRelease = wf["release"].get<std::string>();
        std::string wLicenseId = wf["licenseId"].get<std::string>();
        std::string wDevice = wf["deviceHash"].get<std::string>();
        int64_t wNow = wf["nowMs"].get<int64_t>();

        auto wclaims = verifyWireProof(payload, signature, *eccBlob, wProduct, wRelease, wLicenseId, wDevice, wNow);
        CHECK(wclaims.has_value(), "verifyWireProof accepts a genuine Wire proof");
        if (wclaims) {
            CHECK(wclaims->scope == "mizin-wire", "wire scope constant matches");
            CHECK(wclaims->channel == wf["expectedChannel"].get<std::string>(), "wire channel round-trips");
        }

        std::string tamperedSig = signature;
        tamperedSig.back() = (tamperedSig.back() == 'A') ? 'B' : 'A';
        CHECK(!verifyWireProof(payload, tamperedSig, *eccBlob, wProduct, wRelease, wLicenseId, wDevice, wNow).has_value(),
              "tampered wire signature is rejected");
    } else {
        std::cout << "(skipped: wire_fixture.json not present)\n";
    }

    // --- sha256Hex matches Node's digest() for a known input ---
    CHECK(sha256Hex(std::string(64,'a')) == deviceHash, "sha256Hex matches server-side digest() for installationKey");

    std::cout << "\n" << (failures == 0 ? "ALL PASS" : "FAILURES: " + std::to_string(failures)) << "\n";
    return failures == 0 ? 0 : 1;
}
