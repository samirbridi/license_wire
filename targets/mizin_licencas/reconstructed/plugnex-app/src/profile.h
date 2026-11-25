// Local encrypted profile storage for the PLUGNEX desktop app.
//
// Mirrors Local.Load()/Local.Save() in the earlier C# "Mizin Wire"
// Manager.cs: a per-user DPAPI-protected (CurrentUser scope) JSON blob at
//   %LOCALAPPDATA%\Plugnex\App\<sha256(origin+"|"+publicKey)[:24]>\profile.bin
// with the same crash-safe write-temp-then-replace sequence. Scoping the
// directory to a hash of (origin, public key) is intentional: a profile
// created against one store/key cannot be silently reused against another
// (e.g. switching LICENSE_ORIGIN in dev vs. prod), matching the prior
// client's DirectoryName construction exactly.
#pragma once

#include <windows.h>
#include <wincrypt.h>
#include <shlobj.h>
#include <string>
#include <vector>
#include <fstream>
#include <sstream>

#include "../vendor/json.hpp"
#include "crypto.h"

#pragma comment(lib, "crypt32.lib")
#pragma comment(lib, "shell32.lib")
#pragma comment(lib, "ole32.lib")

namespace plugnex {

struct PluginRef {
    std::string name, product, release, licenseId, offer;
    bool hasDemo = false;
    int used = 0, seats = 0;
};

struct ProofEntry {
    PluginRef plugin;
    std::string payload, signature;
};

struct Profile {
    std::string installationKey;   // 64-hex-char random local secret; the device identity.
    std::string email;
    std::string sessionCookie;     // "session=<token>" as returned by the server.
    int oscPort = 7000;
    std::vector<ProofEntry> entries;
};

inline nlohmann::json pluginToJson(const PluginRef& p) {
    return {{"name",p.name},{"product",p.product},{"release",p.release},
            {"licenseId",p.licenseId},{"offer",p.offer},{"hasDemo",p.hasDemo},
            {"used",p.used},{"seats",p.seats}};
}

inline PluginRef pluginFromJson(const nlohmann::json& j) {
    PluginRef p;
    p.name = j.value("name", std::string());
    p.product = j.value("product", std::string());
    p.release = j.value("release", std::string());
    p.licenseId = j.value("licenseId", std::string());
    p.offer = j.value("offer", std::string());
    p.hasDemo = j.value("hasDemo", false);
    p.used = j.value("used", 0);
    p.seats = j.value("seats", 0);
    return p;
}

inline nlohmann::json profileToJson(const Profile& p) {
    nlohmann::json entries = nlohmann::json::array();
    for (const auto& e : p.entries) {
        entries.push_back({{"plugin",pluginToJson(e.plugin)},{"payload",e.payload},{"signature",e.signature}});
    }
    return {{"installationKey",p.installationKey},{"email",p.email},
            {"sessionCookie",p.sessionCookie},{"oscPort",p.oscPort},{"entries",entries}};
}

inline Profile profileFromJson(const nlohmann::json& j) {
    Profile p;
    p.installationKey = j.value("installationKey", std::string());
    p.email = j.value("email", std::string());
    p.sessionCookie = j.value("sessionCookie", std::string());
    p.oscPort = j.value("oscPort", 7000);
    if (j.contains("entries") && j["entries"].is_array()) {
        for (const auto& e : j["entries"]) {
            ProofEntry entry;
            entry.plugin = pluginFromJson(e.value("plugin", nlohmann::json::object()));
            entry.payload = e.value("payload", std::string());
            entry.signature = e.value("signature", std::string());
            p.entries.push_back(entry);
        }
    }
    return p;
}

class ProfileStore {
public:
    ProfileStore(const std::wstring& origin, const std::string& publicKeyMaterial) {
        std::string tag = crypto::sha256Hex(toUtf8(origin) + "|" + publicKeyMaterial).substr(0, 24);
        wchar_t* localAppData = nullptr;
        if (SHGetKnownFolderPath(FOLDERID_LocalAppData, 0, nullptr, &localAppData) == S_OK) {
            directory_ = std::wstring(localAppData) + L"\\Plugnex\\App\\" + std::wstring(tag.begin(), tag.end());
            CoTaskMemFree(localAppData);
        } else {
            directory_ = L"PlugnexProfile";
        }
        CreateDirectoryRecursive(directory_);
        path_ = directory_ + L"\\profile.bin";
    }

    // Loads the profile, decrypting via DPAPI (CurrentUser). If none exists
    // yet, generates a fresh installationKey -- the local device identity
    // the whole offline-trust chain is anchored on -- and returns an
    // otherwise-empty profile (not yet persisted; caller should Save()
    // after any change).
    Profile load() {
        std::vector<uint8_t> encrypted = readAllBytes(path_);
        if (!encrypted.empty()) {
            auto decrypted = dpapiUnprotect(encrypted);
            if (decrypted.has_value()) {
                try {
                    auto j = nlohmann::json::parse(std::string(decrypted->begin(), decrypted->end()));
                    auto profile = profileFromJson(j);
                    if (!profile.installationKey.empty()) return profile;
                } catch (...) {
                    // Fall through to a fresh profile; a corrupt/foreign
                    // blob must never crash the app or silently grant trust.
                }
            }
        }
        Profile fresh;
        fresh.installationKey = crypto::generateInstallationKey();
        return fresh;
    }

    // Crash-safe save: encrypt, write to a temp file, then atomically
    // replace -- same property File.Replace/.Move gave Local.Save() in
    // Manager.cs.
    void save(const Profile& profile) {
        std::string json = profileToJson(profile).dump();
        std::vector<uint8_t> plain(json.begin(), json.end());
        auto encrypted = dpapiProtect(plain);
        std::wstring temp = path_ + L".tmp";
        {
            HANDLE file = CreateFileW(temp.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
            if (file == INVALID_HANDLE_VALUE) return;
            DWORD written = 0;
            WriteFile(file, encrypted.data(), static_cast<DWORD>(encrypted.size()), &written, nullptr);
            CloseHandle(file);
        }
        MoveFileExW(temp.c_str(), path_.c_str(), MOVEFILE_REPLACE_EXISTING);
    }

private:
    std::wstring directory_, path_;

    static std::string toUtf8(const std::wstring& w) {
        if (w.empty()) return {};
        int len = WideCharToMultiByte(CP_UTF8, 0, w.c_str(), -1, nullptr, 0, nullptr, nullptr);
        std::string out(len, '\0');
        WideCharToMultiByte(CP_UTF8, 0, w.c_str(), -1, out.data(), len, nullptr, nullptr);
        if (!out.empty() && out.back() == '\0') out.pop_back();
        return out;
    }

    static void CreateDirectoryRecursive(const std::wstring& path) {
        if (path.empty() || CreateDirectoryW(path.c_str(), nullptr) || GetLastError() == ERROR_ALREADY_EXISTS) return;
        size_t pos = path.find_last_of(L"\\/");
        if (pos != std::wstring::npos) CreateDirectoryRecursive(path.substr(0, pos));
        CreateDirectoryW(path.c_str(), nullptr);
    }

    static std::vector<uint8_t> readAllBytes(const std::wstring& path) {
        HANDLE file = CreateFileW(path.c_str(), GENERIC_READ, FILE_SHARE_READ, nullptr, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
        if (file == INVALID_HANDLE_VALUE) return {};
        LARGE_INTEGER size;
        if (!GetFileSizeEx(file, &size) || size.QuadPart <= 0 || size.QuadPart > 16 * 1024 * 1024) { CloseHandle(file); return {}; }
        std::vector<uint8_t> buffer(static_cast<size_t>(size.QuadPart));
        DWORD read = 0;
        BOOL ok = ReadFile(file, buffer.data(), static_cast<DWORD>(buffer.size()), &read, nullptr);
        CloseHandle(file);
        if (!ok || read != buffer.size()) return {};
        return buffer;
    }

    static std::vector<uint8_t> dpapiProtect(const std::vector<uint8_t>& plain) {
        DATA_BLOB in{static_cast<DWORD>(plain.size()), const_cast<BYTE*>(plain.data())};
        DATA_BLOB out{};
        std::vector<uint8_t> result;
        if (CryptProtectData(&in, L"PLUGNEX profile", nullptr, nullptr, nullptr, CRYPTPROTECT_UI_FORBIDDEN, &out)) {
            result.assign(out.pbData, out.pbData + out.cbData);
            LocalFree(out.pbData);
        }
        return result;
    }

    static std::optional<std::vector<uint8_t>> dpapiUnprotect(const std::vector<uint8_t>& encrypted) {
        DATA_BLOB in{static_cast<DWORD>(encrypted.size()), const_cast<BYTE*>(encrypted.data())};
        DATA_BLOB out{};
        if (!CryptUnprotectData(&in, nullptr, nullptr, nullptr, nullptr, CRYPTPROTECT_UI_FORBIDDEN, &out)) {
            return std::nullopt;
        }
        std::vector<uint8_t> result(out.pbData, out.pbData + out.cbData);
        LocalFree(out.pbData);
        return result;
    }
};

} // namespace plugnex
