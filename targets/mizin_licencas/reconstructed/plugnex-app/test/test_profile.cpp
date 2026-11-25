// Round-trip test for profile.h: DPAPI-encrypted save/load of the local
// device profile, matching Manager.cs's Local.Save()/Local.Load() contract.
//
// Each run scopes itself to a fresh, random origin string so it always
// starts from a genuinely empty profile directory under
// %LOCALAPPDATA%\Plugnex\App\<hash>\ -- this both keeps repeated test runs
// independent (no leftover profile.bin from a prior run) and doubles as a
// live exercise of ProfileStore's own isolation-by-origin property.
#include <windows.h>
#include <bcrypt.h>
#include <iostream>
#include "../src/profile.h"

#pragma comment(lib, "bcrypt.lib")

static int failures = 0;
#define CHECK(cond, msg) do { if (!(cond)) { std::cerr << "FAIL: " << msg << " (line " << __LINE__ << ")\n"; failures++; } else { std::cout << "ok: " << msg << "\n"; } } while(0)

static std::wstring randomRunTag() {
    uint8_t bytes[8];
    BCRYPT_ALG_HANDLE alg = nullptr;
    BCryptOpenAlgorithmProvider(&alg, BCRYPT_RNG_ALGORITHM, nullptr, 0);
    BCryptGenRandom(alg, bytes, sizeof(bytes), 0);
    BCryptCloseAlgorithmProvider(alg, 0);
    std::wstring tag;
    for (uint8_t b : bytes) { wchar_t buf[3]; swprintf(buf, 3, L"%02x", b); tag += buf; }
    return tag;
}

int main() {
    using namespace plugnex;

    std::wstring runOrigin = L"http://127.0.0.1:4381/test-run-" + randomRunTag();
    ProfileStore store(runOrigin, "test-public-key-material");

    Profile first = store.load();
    CHECK(first.installationKey.size() == 64, "fresh profile gets a 64-hex-char installation key");
    CHECK(first.email.empty(), "fresh profile has no email yet");

    first.email = "qa@example.invalid";
    first.sessionCookie = "session=deadbeef";
    first.oscPort = 7777;
    ProofEntry entry;
    entry.plugin.name = "Slice Refine Pro";
    entry.plugin.product = "slice-refine";
    entry.plugin.release = "studio-1";
    entry.plugin.licenseId = "abc123";
    entry.plugin.seats = 2;
    entry.plugin.used = 1;
    entry.payload = "cGF5bG9hZA==";
    entry.signature = "c2lnbmF0dXJl";
    first.entries.push_back(entry);
    store.save(first);

    Profile reloaded = store.load();
    CHECK(reloaded.installationKey == first.installationKey, "installation key survives save/load round-trip");
    CHECK(reloaded.email == "qa@example.invalid", "email survives round-trip");
    CHECK(reloaded.sessionCookie == "session=deadbeef", "session cookie survives round-trip");
    CHECK(reloaded.oscPort == 7777, "osc port survives round-trip");
    CHECK(reloaded.entries.size() == 1, "one plugin entry survives round-trip");
    if (!reloaded.entries.empty()) {
        CHECK(reloaded.entries[0].plugin.product == "slice-refine", "plugin product survives round-trip");
        CHECK(reloaded.entries[0].payload == "cGF5bG9hZA==", "proof payload survives round-trip");
    }

    // A different (origin, key) pair must get an independent profile
    // directory -- never silently share trust across stores/environments.
    ProfileStore otherStore(L"http://127.0.0.1:4381", "different-public-key-material");
    Profile other = otherStore.load();
    CHECK(other.installationKey != first.installationKey, "different public key material yields an independent profile");

    std::cout << "\n" << (failures == 0 ? "ALL PASS" : "FAILURES: " + std::to_string(failures)) << "\n";
    return failures == 0 ? 0 : 1;
}
