// PLUGNEX desktop app -- native Win32 client for the licensing portal in
// this same target (server.mjs), styled after the approved "Graphite
// Edition" visual reference (targets/mizin_licencas/visual/): a 5-tab
// shell (Discover / My Plugins / Updates / Licenses / Settings) over a
// 3-panel layout (sidebar / table / inspector). See visual/START_HERE_IDE.md
// for the design brief this implementation follows.
//
// This is a visual rebuild of the previous plain-Win32-controls shell; the
// backend/networking/crypto layers underneath are UNCHANGED and were
// already validated standalone (see test/) and end-to-end against a real
// server before this rewrite -- only the rendering layer changes here.
//
// Architecture:
//   httpclient.h, crypto.h, profile.h, osc.h, catalog_logic.h -- unchanged.
//   theme.h    -- Graphite color/font/metric tokens, drawing helpers.
//   icons.h    -- generic category glyphs for the plugin tiles/hero panel.
//   main.cpp (this file) -- owner-drawn Graphite shell wiring it together.
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <commdlg.h>
#include <shellapi.h>
#include <shlwapi.h>
#include <gdiplus.h>
#include <string>
#include <vector>
#include <memory>
#include <thread>
#include <mutex>
#include <atomic>
#include <chrono>
#include <optional>
#include <functional>
#include <algorithm>

#include "httpclient.h"
#include "crypto.h"
#include "profile.h"
#include "osc.h"
#include "catalog_logic.h"
#include "theme.h"
#include "icons.h"
#include "resource_ids.h"

#pragma comment(lib, "shlwapi.lib")
#pragma comment(lib, "comdlg32.lib")
#pragma comment(lib, "shell32.lib")
#pragma comment(lib, "gdiplus.lib")

#ifndef PLUGNEX_ORIGIN_HOST
#define PLUGNEX_ORIGIN_HOST L"127.0.0.1"
#endif
#ifndef PLUGNEX_ORIGIN_PORT
#define PLUGNEX_ORIGIN_PORT 4381
#endif
#ifndef PLUGNEX_ORIGIN_TLS
#define PLUGNEX_ORIGIN_TLS false
#endif

using namespace plugnex;
using json = nlohmann::json;

// ---------------------------------------------------------------------
// View model: one row the UI renders, unifying direct+Wire library items
// AND catalog-only (not-yet-owned) offers into a single shape so Discover/
// My Plugins/Updates/Licenses can all share one table-rendering routine,
// the same way the prototype's `data` array backs all four tabs.
// ---------------------------------------------------------------------
struct Row {
    // Identity (catalog-level; always present).
    std::string productId, productName, kindLabel, offerId;
    bool includesWire = false;

    // Ownership (present only if the signed-in account owns this item).
    bool owned = false;
    catalog_logic::ActivatableItem item; // valid iff owned.

    // Local activation state (derived by verifying the saved proof, if any).
    bool activatedHere = false;
    catalog_logic::InstallState installState = catalog_logic::InstallState::NotInstalled;

    // Catalog-only (not owned): price for the Discover tab.
    long long price = 0;
};

enum class Tab { Discover, MyPlugins, Updates, Licenses, Settings };
constexpr const wchar_t* kTabLabels[] = {L"Discover", L"My Plugins", L"Updates", L"Licenses", L"Settings"};
// Typed at BYTE from the start (never an int literal narrowed at the call
// site) so Gdiplus::Color(kOpaque, r, g, b) never trips /W4's C4310 the way
// Gdiplus::Color(255, r, g, b) or even Gdiplus::Color((BYTE)255, r, g, b) did.
constexpr BYTE kOpaque = 255;
constexpr Tab kTabOrder[] = {Tab::Discover, Tab::MyPlugins, Tab::Updates, Tab::Licenses, Tab::Settings};

static std::wstring toWide(const std::string& s) {
    if (s.empty()) return {};
    int len = MultiByteToWideChar(CP_UTF8, 0, s.c_str(), -1, nullptr, 0);
    std::wstring out(static_cast<size_t>(len), L'\0');
    MultiByteToWideChar(CP_UTF8, 0, s.c_str(), -1, out.data(), len);
    if (!out.empty() && out.back() == L'\0') out.pop_back();
    return out;
}
static std::string toUtf8(const std::wstring& w) {
    if (w.empty()) return {};
    int len = WideCharToMultiByte(CP_UTF8, 0, w.c_str(), -1, nullptr, 0, nullptr, nullptr);
    std::string out(static_cast<size_t>(len), '\0');
    WideCharToMultiByte(CP_UTF8, 0, w.c_str(), -1, out.data(), len, nullptr, nullptr);
    if (!out.empty() && out.back() == '\0') out.pop_back();
    return out;
}
static int64_t nowMs() {
    return std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::system_clock::now().time_since_epoch()).count();
}
static std::wstring machineLabel() {
    wchar_t name[MAX_COMPUTERNAME_LENGTH + 1];
    DWORD size = MAX_COMPUTERNAME_LENGTH + 1;
    if (GetComputerNameW(name, &size)) return name;
    return L"PLUGNEX PC";
}
static std::wstring money(long long cents) {
    wchar_t buf[48];
    swprintf(buf, 48, L"R$ %.2f", cents / 100.0);
    return buf;
}

// ---------------------------------------------------------------------
// Application state.
// ---------------------------------------------------------------------
enum { WM_APP_ERROR = WM_APP + 1, WM_APP_WORK_DONE, WM_APP_HEARTBEAT, ID_TIMER_HEARTBEAT = 9001, ID_TIMER_SYNC = 9002 };
enum {
    ID_EDIT_LOGIN_EMAIL = 2001, ID_EDIT_LOGIN_PASSWORD, ID_EDIT_OSC_PORT, ID_EDIT_SEARCH,
    ID_BTN_LOGIN, ID_BTN_LOGOUT, ID_BTN_SAVE_OSC_PORT,
};

struct AppState {
    std::wstring originHost = PLUGNEX_ORIGIN_HOST;
    INTERNET_PORT originPort = PLUGNEX_ORIGIN_PORT;
    bool originTls = PLUGNEX_ORIGIN_TLS;

    std::unique_ptr<HttpClient> http;
    std::unique_ptr<ProfileStore> profileStore;
    Profile profile;
    std::mutex profileMutex; // guards `profile` (also touched by the heartbeat thread).

    // --- Fields below are the "app model": written by background worker
    // threads (loadCatalog/loadWireKeyIfNeeded/rebuildRows/login/logout,
    // all run via runAsync) and read by the UI thread (paint(), which
    // Windows can invoke at any time via WM_PAINT, not only right after
    // InvalidateRect) and, for the key-material fields, by the heartbeat
    // thread too. All reads AND writes of these six fields must go
    // through modelMutex -- found and fixed after a real crash during
    // manual testing traced to an unsynchronized std::vector (app->rows)
    // being read mid-write. modelMutex is intentionally separate from
    // profileMutex (disjoint data, never nested) so neither can deadlock
    // waiting on the other.
    std::mutex modelMutex;
    json catalog;
    std::vector<uint8_t> ed25519PublicKeyRaw;
    bool wireKeyLoaded = false;
    std::vector<uint8_t> wireEccBlob;
    std::vector<Row> rows;        // full merged set (catalog + ownership + activation).
    std::string currentEmail;
    bool signedIn = false;

    bool busy = false; // UI-thread-only: set/cleared exclusively from WM_* handlers, never from a worker thread.

    // Snapshot accessors: every read OR write of the fields above goes
    // through one of these (or takes modelMutex directly for a single
    // assignment). Callers copy out what they need under the lock, then
    // do all their (possibly slow: JSON parsing, network I/O) work on the
    // local copy -- the lock is only ever held for a plain copy, never
    // across I/O or UI drawing.
    std::vector<Row> snapshotRows() {
        std::lock_guard<std::mutex> lock(modelMutex);
        return rows;
    }
    struct ModelSnapshot { std::vector<Row> rows; std::string currentEmail; bool signedIn = false; };
    ModelSnapshot snapshotModel() {
        std::lock_guard<std::mutex> lock(modelMutex);
        return {rows, currentEmail, signedIn};
    }
    struct CatalogSnapshot { json catalog; bool signedIn = false; };
    CatalogSnapshot snapshotCatalog() {
        std::lock_guard<std::mutex> lock(modelMutex);
        return {catalog, signedIn};
    }
    struct KeyMaterialSnapshot { bool wireKeyLoaded = false; std::vector<uint8_t> wireEccBlob; std::vector<uint8_t> ed25519PublicKeyRaw; };
    KeyMaterialSnapshot snapshotKeys() {
        std::lock_guard<std::mutex> lock(modelMutex);
        return {wireKeyLoaded, wireEccBlob, ed25519PublicKeyRaw};
    }

    Tab tab = Tab::Discover;
    int selectedRow = -1;
    std::wstring searchQuery;
    std::wstring statusText = L"Ready. Entre na conta em Settings para sincronizar suas compras.";

    std::atomic<bool> heartbeatRunning{false};
    std::thread heartbeatThread;

    HWND hwnd = nullptr;
    HWND editLoginEmail = nullptr, editLoginPassword = nullptr, editOscPort = nullptr, editSearch = nullptr;
    HWND btnLogin = nullptr, btnLogout = nullptr, btnSaveOscPort = nullptr;
    Gdiplus::Bitmap* logoBitmap = nullptr;
    theme::Fonts fonts;

    // Layout rects, recomputed on WM_SIZE / tab change; hit-tested in
    // WM_LBUTTONDOWN the same way the prototype's delegated onclick works.
    RECT rTabs[5]{};
    RECT rSidebarFilters[8]{}; int sidebarFilterCount = 0;
    std::vector<std::wstring> sidebarFilterLabels;
    std::wstring activeFilter = L"All plugins";
    RECT rRows[64]{}; int rowCount = 0; // row index -> on-screen rect, for click hit-testing.
    RECT rMainAction{}, rSecondaryAction{};
    RECT rRefreshButton{};
};

// ---------------------------------------------------------------------
// Networking / business logic (runs on worker threads).
// ---------------------------------------------------------------------

static void loadCatalog(AppState* app) {
    json resp = app->http->getJson(L"/api/catalog");
    json newCatalog = resp.at("catalog");
    std::string newEmail = resp.value("email", std::string());
    bool newSignedIn = !newEmail.empty();

    bool needKey;
    { std::lock_guard<std::mutex> lock(app->modelMutex); needKey = app->ed25519PublicKeyRaw.empty(); }
    std::optional<std::vector<uint8_t>> raw;
    if (needKey) {
        try {
            json keyResp = app->http->getJson(L"/api/public-key");
            raw = crypto::ed25519RawFromSpkiPem(keyResp.at("key").get<std::string>());
        } catch (...) {}
    }

    std::lock_guard<std::mutex> lock(app->modelMutex);
    app->catalog = std::move(newCatalog);
    app->currentEmail = std::move(newEmail);
    app->signedIn = newSignedIn;
    if (raw.has_value()) app->ed25519PublicKeyRaw = *raw;
}

static void loadWireKeyIfNeeded(AppState* app) {
    bool already;
    { std::lock_guard<std::mutex> lock(app->modelMutex); already = app->wireKeyLoaded; }
    if (already) return;
    try {
        json resp = app->http->getJson(L"/api/wire/issuer");
        auto decoded = crypto::decodeWirePublicBlob(resp.at("publicBlob").get<std::string>());
        if (decoded.has_value()) {
            std::lock_guard<std::mutex> lock(app->modelMutex);
            app->wireEccBlob = *decoded;
            app->wireKeyLoaded = true;
        }
    } catch (...) {}
}

static bool hasValidLocalProof(AppState* app, const catalog_logic::ActivatableItem& item, std::string* outRelease = nullptr) {
    auto keys = app->snapshotKeys();
    std::lock_guard<std::mutex> lock(app->profileMutex);
    std::string deviceHash = crypto::sha256Hex(app->profile.installationKey);
    for (const auto& entry : app->profile.entries) {
        if (entry.plugin.product != item.product) continue;
        if (item.isWire) {
            if (entry.plugin.licenseId != item.licenseId) continue;
            if (!keys.wireKeyLoaded) continue;
            auto claims = crypto::verifyWireProof(entry.payload, entry.signature, keys.wireEccBlob,
                                                   item.product, entry.plugin.release, item.licenseId, deviceHash, nowMs());
            if (claims.has_value()) { if (outRelease) *outRelease = entry.plugin.release; return true; }
        } else {
            if (keys.ed25519PublicKeyRaw.size() != 32) continue;
            auto claims = crypto::verifyDirectToken(entry.payload, keys.ed25519PublicKeyRaw, deviceHash,
                                                     item.product, entry.plugin.release, nowMs());
            if (claims.has_value()) { if (outRelease) *outRelease = entry.plugin.release; return true; }
        }
    }
    return false;
}

// Rebuilds AppState::rows from scratch: catalog offers (Discover baseline)
// merged with real ownership (/api/account, /api/wire/library) and real
// local activation state (verified signatures, not a cached flag). Reads
// `catalog`/`signedIn` via a snapshot and only takes modelMutex again at
// the very end to publish the new `rows` -- never while doing the network
// I/O or JSON walking in between.
static void rebuildRows(AppState* app) {
    auto cat = app->snapshotCatalog();
    std::vector<Row> rows;
    auto storeOffers = catalog_logic::buildStoreOffers(cat.catalog);

    std::vector<catalog_logic::ActivatableItem> owned;
    if (cat.signedIn) {
        try {
            json account = app->http->getJson(L"/api/account");
            for (const auto& license : account.at("licenses")) {
                auto direct = catalog_logic::resolveDirectItems(cat.catalog, license);
                owned.insert(owned.end(), direct.begin(), direct.end());
            }
        } catch (...) {}
        try {
            json wireLib = app->http->getJson(L"/api/wire/library");
            for (const auto& entry : wireLib.at("plugins")) owned.push_back(catalog_logic::fromWireLibraryEntry(entry));
        } catch (...) {}
    }

    for (const auto& offer : storeOffers) {
        // One row per product in the offer (matches the per-product
        // granularity of My Plugins/Updates/Licenses; Discover shows the
        // same rows, priced via the offer they belong to).
        for (const auto& productIdJson : cat.catalog.at("offers")) {
            if (productIdJson.at("id").get<std::string>() != offer.id) continue;
            for (const auto& pid : productIdJson.at("items")) {
                std::string productId = pid.get<std::string>();
                auto productIt = std::find_if(cat.catalog.at("products").begin(), cat.catalog.at("products").end(),
                                               [&](const json& p) { return p.at("id").get<std::string>() == productId; });
                if (productIt == cat.catalog.at("products").end()) continue;

                Row row;
                row.productId = productId;
                row.productName = productIt->at("name").get<std::string>();
                row.kindLabel = productIt->value("kind", std::string("Produto"));
                row.offerId = offer.id;
                row.includesWire = productIt->contains("wireReleases") && !(*productIt)["wireReleases"].empty();
                row.price = offer.price;

                auto ownedIt = std::find_if(owned.begin(), owned.end(), [&](const catalog_logic::ActivatableItem& i) { return i.product == productId; });
                if (ownedIt != owned.end()) {
                    row.owned = true;
                    row.item = *ownedIt;
                    std::string activatedRelease;
                    row.activatedHere = hasValidLocalProof(app, row.item, &activatedRelease);
                    row.installState = catalog_logic::computeInstallState(row.item.release, row.activatedHere ? &activatedRelease : nullptr);
                }
                rows.push_back(row);
            }
        }
    }
    // De-duplicate by productId (a product can appear in more than one
    // offer, e.g. a standalone offer and a bundle both including it) --
    // keep the owned/richer row if there's a conflict.
    std::vector<Row> deduped;
    for (auto& r : rows) {
        auto existing = std::find_if(deduped.begin(), deduped.end(), [&](const Row& d) { return d.productId == r.productId; });
        if (existing == deduped.end()) deduped.push_back(r);
        else if (r.owned && !existing->owned) *existing = r;
    }
    std::lock_guard<std::mutex> lock(app->modelMutex);
    app->rows = std::move(deduped);
}

static void activateRow(AppState* app, Row& row, bool newSeat) {
    std::string installationKey, label = toUtf8(machineLabel());
    {
        std::lock_guard<std::mutex> lock(app->profileMutex);
        installationKey = app->profile.installationKey;
    }
    ProofEntry entry;
    entry.plugin.product = row.item.product;
    entry.plugin.release = row.item.release;
    entry.plugin.name = row.productName;
    entry.plugin.licenseId = row.item.licenseId;
    entry.plugin.offer = row.item.offerId;
    entry.plugin.seats = row.item.seats;
    entry.plugin.used = row.item.used;

    if (row.item.isWire) {
        json body = {{"product", row.item.product}, {"release", row.item.release},
                     {"licenseId", row.item.licenseId}, {"installationKey", installationKey}, {"label", label}};
        json proof = app->http->postJson(newSeat ? L"/api/wire/activate" : L"/api/wire/verify", body);
        entry.payload = proof.at("payload").get<std::string>();
        entry.signature = proof.at("signature").get<std::string>();
    } else {
        json body = {{"serial", row.item.serial}, {"product", row.item.product}, {"release", row.item.release},
                     {"installationKey", installationKey}, {"label", label}};
        json tokenResp = app->http->postJson(newSeat ? L"/api/activate" : L"/api/verify", body);
        entry.payload = tokenResp.at("token").get<std::string>();
        entry.signature.clear();
    }
    std::lock_guard<std::mutex> lock(app->profileMutex);
    auto matches = [&](const ProofEntry& e) {
        return e.plugin.product == row.item.product && (!row.item.isWire || e.plugin.licenseId == row.item.licenseId);
    };
    app->profile.entries.erase(std::remove_if(app->profile.entries.begin(), app->profile.entries.end(), matches), app->profile.entries.end());
    app->profile.entries.push_back(entry);
    app->profileStore->save(app->profile);
}

static void deactivateRow(AppState* app, Row& row) {
    std::string deviceHash;
    {
        std::lock_guard<std::mutex> lock(app->profileMutex);
        deviceHash = crypto::sha256Hex(app->profile.installationKey);
    }
    if (!row.item.isWire) {
        json account = app->http->getJson(L"/api/account");
        for (const auto& license : account.at("licenses")) {
            if (license.at("serial").get<std::string>() != row.item.serial) continue;
            for (const auto& device : license.at("devices")) {
                if (device.at("device").get<std::string>() == deviceHash) {
                    json body = {{"serial", row.item.serial}, {"device", deviceHash}};
                    app->http->postJson(L"/api/release-machine", body);
                }
            }
        }
    }
    std::lock_guard<std::mutex> lock(app->profileMutex);
    auto matches = [&](const ProofEntry& e) {
        return e.plugin.product == row.item.product && (!row.item.isWire || e.plugin.licenseId == row.item.licenseId);
    };
    app->profile.entries.erase(std::remove_if(app->profile.entries.begin(), app->profile.entries.end(), matches), app->profile.entries.end());
    app->profileStore->save(app->profile);
}

static void heartbeatLoop(AppState* app) {
    OscSender localOsc;
    while (app->heartbeatRunning.load()) {
        auto keys = app->snapshotKeys();
        {
            std::lock_guard<std::mutex> lock(app->profileMutex);
            std::string deviceHash = crypto::sha256Hex(app->profile.installationKey);
            for (const auto& entry : app->profile.entries) {
                bool valid = false; std::string channel;
                if (entry.signature.empty()) {
                    if (keys.ed25519PublicKeyRaw.size() == 32) {
                        auto claims = crypto::verifyDirectToken(entry.payload, keys.ed25519PublicKeyRaw, deviceHash,
                                                                 entry.plugin.product, entry.plugin.release, nowMs());
                        valid = claims.has_value();
                    }
                } else if (keys.wireKeyLoaded) {
                    auto claims = crypto::verifyWireProof(entry.payload, entry.signature, keys.wireEccBlob,
                                                           entry.plugin.product, entry.plugin.release, entry.plugin.licenseId, deviceHash, nowMs());
                    if (claims.has_value()) { valid = true; channel = claims->channel; }
                }
                if (valid && localOsc.isReady()) {
                    localOsc.sendPulse(entry.plugin.product, entry.plugin.release, channel, static_cast<uint16_t>(app->profile.oscPort));
                }
            }
        }
        if (app->hwnd) PostMessageW(app->hwnd, WM_APP_HEARTBEAT, 0, 0);
        for (int i = 0; i < 10 && app->heartbeatRunning.load(); i++) std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }
}

static void runAsync(AppState* app, HWND hwnd, std::function<void()> work, std::function<void()> onDone) {
    if (app->busy) return;
    app->busy = true;
    InvalidateRect(hwnd, nullptr, FALSE);
    auto* doneCopy = new std::function<void()>(std::move(onDone));
    std::thread([app, hwnd, work = std::move(work), doneCopy]() {
        try { work(); }
        catch (const ApiError& e) { auto* m = new std::string(e.what()); PostMessageW(hwnd, WM_APP_ERROR, 0, (LPARAM)m); }
        catch (const TransportError& e) { auto* m = new std::string(std::string("Loja indisponivel: ") + e.what()); PostMessageW(hwnd, WM_APP_ERROR, 0, (LPARAM)m); }
        catch (const std::exception& e) { auto* m = new std::string(e.what()); PostMessageW(hwnd, WM_APP_ERROR, 0, (LPARAM)m); }
        PostMessageW(hwnd, WM_APP_WORK_DONE, 0, (LPARAM)doneCopy);
    }).detach();
}

// ---------------------------------------------------------------------
// Rendering (GDI+), following the Graphite layout 1:1.
// ---------------------------------------------------------------------

// Positions/shows/hides the native EDIT/BUTTON controls that sit on top
// of the owner-drawn shell for the few things that genuinely need real
// text input (login, OSC port) -- recomputed on every WM_SIZE and tab
// change using the exact same header/menu/tabs/toolbar heights paint()
// uses, so the controls land exactly where their owner-drawn backdrop
// (search box outline, Settings "value" boxes) is drawn.
static void layoutControls(AppState* app, RECT client) {
    int y = theme::HeaderHeight + theme::MenuHeight + theme::TabsHeight;
    bool showToolbar = (app->tab != Tab::Settings);
    if (showToolbar) {
        RECT toolbar{0, y, client.right, y + theme::ToolbarHeight};
        MoveWindow(app->editSearch, 12, toolbar.top + 9, 300, 30, TRUE);
        ShowWindow(app->editSearch, SW_SHOW);
    } else {
        ShowWindow(app->editSearch, SW_HIDE);
    }

    bool settings = (app->tab == Tab::Settings);
    if (settings) {
        // Mirror the settingLine() layout math in paint()'s Settings branch:
        // table area starts after header+menu+tabs+titlearea (no toolbar on
        // this tab), sidebar+gap offsets the left edge the same way.
        int sideRight = theme::PanelGap + theme::SidebarWidth;
        int tableLeft = sideRight + theme::PanelGap;
        int tableTop = y + theme::PanelGap + theme::HeadBarHeight + theme::TitleAreaHeight;
        int sy = tableTop + 20;
        bool signedIn;
        { std::lock_guard<std::mutex> lock(app->modelMutex); signedIn = app->signedIn; }
        if (!signedIn) {
            sy += 40; // "Account" group label row.
            MoveWindow(app->editLoginEmail, tableLeft + 210, sy, 260, 26, TRUE); sy += 40;
            MoveWindow(app->editLoginPassword, tableLeft + 210, sy, 260, 26, TRUE);
            MoveWindow(app->btnLogin, tableLeft + 480, sy - 2, 90, 30, TRUE);
            ShowWindow(app->editLoginEmail, SW_SHOW);
            ShowWindow(app->editLoginPassword, SW_SHOW);
            ShowWindow(app->btnLogin, SW_SHOW);
            ShowWindow(app->btnLogout, SW_HIDE);
        } else {
            sy += 40;
            MoveWindow(app->btnLogout, tableLeft + 210, sy - 2, 140, 30, TRUE);
            ShowWindow(app->btnLogout, SW_SHOW);
            ShowWindow(app->editLoginEmail, SW_HIDE);
            ShowWindow(app->editLoginPassword, SW_HIDE);
            ShowWindow(app->btnLogin, SW_HIDE);
        }
        int oscY = sy + 40 + 10 + 26; // past the "Conexao Wire/Arena" group label.
        MoveWindow(app->editOscPort, tableLeft + 210, oscY, 120, 26, TRUE);
        MoveWindow(app->btnSaveOscPort, tableLeft + 340, oscY - 2, 110, 30, TRUE);
        ShowWindow(app->editOscPort, SW_SHOW);
        ShowWindow(app->btnSaveOscPort, SW_SHOW);
    } else {
        ShowWindow(app->editLoginEmail, SW_HIDE);
        ShowWindow(app->editLoginPassword, SW_HIDE);
        ShowWindow(app->btnLogin, SW_HIDE);
        ShowWindow(app->btnLogout, SW_HIDE);
        ShowWindow(app->editOscPort, SW_HIDE);
        ShowWindow(app->btnSaveOscPort, SW_HIDE);
    }
}

static Gdiplus::Bitmap* loadEmbeddedPng(HINSTANCE instance, int resourceId) {
    HRSRC res = FindResourceW(instance, MAKEINTRESOURCEW(resourceId), RT_RCDATA);
    if (!res) return nullptr;
    HGLOBAL mem = LoadResource(instance, res);
    if (!mem) return nullptr;
    void* data = LockResource(mem);
    DWORD size = SizeofResource(instance, res);
    if (!data || !size) return nullptr;
    HGLOBAL buffer = GlobalAlloc(GMEM_MOVEABLE, size);
    if (!buffer) return nullptr;
    void* bufferPtr = GlobalLock(buffer);
    memcpy(bufferPtr, data, size);
    GlobalUnlock(buffer);
    IStream* stream = nullptr;
    if (CreateStreamOnHGlobal(buffer, TRUE, &stream) != S_OK) { GlobalFree(buffer); return nullptr; }
    auto* bmp = new Gdiplus::Bitmap(stream);
    stream->Release();
    return bmp;
}

// Which rows (indices into `rows`) are visible for the current tab +
// search + category filter, mirroring the prototype's `base`/`rows`
// filtering chain. Takes the row list explicitly (a snapshot the caller
// already holds) rather than reading app->rows itself, so every caller is
// forced to decide when it took its snapshot instead of this function
// silently re-reading shared state without a lock.
static std::vector<int> visibleRowIndices(AppState* app, const std::vector<Row>& rows) {
    std::vector<int> result;
    std::wstring q = app->searchQuery;
    std::transform(q.begin(), q.end(), q.begin(), ::towlower);
    for (int i = 0; i < static_cast<int>(rows.size()); i++) {
        const Row& r = rows[i];
        if (app->tab == Tab::MyPlugins && !r.owned) continue;
        if (app->tab == Tab::Updates && r.installState != catalog_logic::InstallState::UpdateAvailable) continue;
        if (app->tab == Tab::Licenses && !r.owned) continue;
        if (app->activeFilter != L"All plugins") {
            std::wstring kind = toWide(r.kindLabel);
            bool matchesCategory =
                (app->activeFilter == L"Sources" && kind.find(L"Aplicativo") != std::wstring::npos) ||
                (app->activeFilter == L"Wire" && r.includesWire) ||
                (app->activeFilter == L"Plugins" && kind.find(L"Plugin") != std::wstring::npos);
            if (!matchesCategory) continue;
        }
        if (!q.empty()) {
            std::wstring hay = toWide(r.productName) + L" " + toWide(r.kindLabel);
            std::transform(hay.begin(), hay.end(), hay.begin(), ::towlower);
            if (hay.find(q) == std::wstring::npos) continue;
        }
        result.push_back(i);
    }
    return result;
}

static std::wstring stateLabel(const Row& r) {
    if (r.installState == catalog_logic::InstallState::Installed) return L"Installed";
    if (r.installState == catalog_logic::InstallState::UpdateAvailable) return L"Update available";
    return r.owned ? L"Available" : L"Not installed";
}
static theme::ChipTone stateTone(const Row& r) {
    if (r.installState == catalog_logic::InstallState::Installed) return theme::ChipTone::Green;
    if (r.installState == catalog_logic::InstallState::UpdateAvailable) return theme::ChipTone::Amber;
    return theme::ChipTone::Muted;
}
static std::wstring actionLabel(AppState* app, const Row& r) {
    if (app->tab == Tab::Licenses) return r.activatedHere ? L"Deactivate" : L"Activate";
    if (!r.owned) return L"View in store";
    if (r.installState == catalog_logic::InstallState::NotInstalled) return L"Activate";
    if (r.installState == catalog_logic::InstallState::UpdateAvailable) return L"Update";
    return L"Download";
}

static void paint(AppState* app, HDC hdcWindow, RECT client) {
    // Single consistent snapshot of the shared app model for this entire
    // paint pass -- every `app->rows`/`app->signedIn`/`app->currentEmail`
    // read below uses `model` instead, so the whole frame renders from one
    // coherent point-in-time view rather than racing a concurrent
    // rebuildRows()/login/logout on a worker thread.
    AppState::ModelSnapshot model = app->snapshotModel();

    HDC hdc = CreateCompatibleDC(hdcWindow);
    HBITMAP bmp = CreateCompatibleBitmap(hdcWindow, client.right, client.bottom);
    HBITMAP oldBmp = (HBITMAP)SelectObject(hdc, bmp);
    Gdiplus::Graphics gfx(hdc);
    gfx.SetSmoothingMode(Gdiplus::SmoothingModeAntiAlias);

    theme::fillRect(hdc, client, theme::Background);

    int y = 0;
    // --- Header ---
    RECT header{0, 0, client.right, theme::HeaderHeight}; y = theme::HeaderHeight;
    theme::fillRect(hdc, header, theme::HeaderBg);
    theme::strokeRectBottom(hdc, header, theme::Border);
    if (app->logoBitmap) {
        float logoH = 28.0f, logoW = logoH * (float)app->logoBitmap->GetWidth() / (float)app->logoBitmap->GetHeight();
        gfx.DrawImage(app->logoBitmap, 15.0f, (theme::HeaderHeight - logoH) / 2.0f, logoW, logoH);
    }
    {
        RECT r{200, 0, 420, theme::HeaderHeight};
        theme::drawText(hdc, L"Plugin Manager", r, theme::Muted, app->fonts.ui, DT_SINGLELINE | DT_VCENTER | DT_LEFT);
    }
    {
        std::wstring right = (model.signedIn ? L"Sessao ativa · " + toWide(model.currentEmail) : L"Nao autenticado") + L"   PLUGNEX";
        RECT r{client.right - 420, 0, client.right - 15, theme::HeaderHeight};
        theme::drawText(hdc, right, r, theme::Muted, app->fonts.textSmall, DT_SINGLELINE | DT_VCENTER | DT_RIGHT);
    }

    // --- Menu row ---
    RECT menu{0, y, client.right, y + theme::MenuHeight}; y += theme::MenuHeight;
    theme::fillRect(hdc, menu, theme::MenuBg);
    theme::strokeRectBottom(hdc, menu, theme::Border);
    {
        RECT r{15, menu.top, client.right - 15, menu.bottom};
        theme::drawText(hdc, L"Graphite Edition", r, theme::Muted, app->fonts.textSmall, DT_SINGLELINE | DT_VCENTER | DT_RIGHT);
    }

    // --- Tabs ---
    RECT tabsArea{0, y, client.right, y + theme::TabsHeight}; y += theme::TabsHeight;
    theme::fillRect(hdc, tabsArea, theme::Panel);
    theme::strokeRectBottom(hdc, tabsArea, theme::Border);
    {
        int x = 12;
        int updatesCount = static_cast<int>(std::count_if(model.rows.begin(), model.rows.end(),
            [](const Row& r) { return r.installState == catalog_logic::InstallState::UpdateAvailable; }));
        for (int i = 0; i < 5; i++) {
            bool active = (kTabOrder[i] == app->tab);
            std::wstring label = kTabLabels[i];
            if (kTabOrder[i] == Tab::Updates && updatesCount > 0) label += L" " + std::to_wstring(updatesCount);
            int w = 46 + static_cast<int>(label.size()) * 7;
            RECT r{x, tabsArea.top, x + w, tabsArea.bottom};
            app->rTabs[i] = r;
            if (active) {
                RECT fill{r.left, r.top, r.right, r.bottom - 2};
                theme::fillRect(hdc, fill, theme::TabActiveBg);
                RECT underline{r.left, r.bottom - 2, r.right, r.bottom};
                theme::fillRect(hdc, underline, theme::Accent);
            }
            theme::drawText(hdc, label, r, active ? RGB(0xE5, 0xED, 0xF9) : theme::Muted, app->fonts.ui, DT_SINGLELINE | DT_VCENTER | DT_CENTER);
            x += w;
        }
    }

    bool showToolbar = (app->tab != Tab::Settings);
    if (showToolbar) {
        RECT toolbar{0, y, client.right, y + theme::ToolbarHeight}; y += theme::ToolbarHeight;
        theme::fillRect(hdc, toolbar, theme::MenuBg);
        theme::strokeRectBottom(hdc, toolbar, theme::Border);
        int visible = static_cast<int>(visibleRowIndices(app, model.rows).size());
        std::wstring count = std::to_wstring(visible) + L" plugins";
        RECT r{client.right - 230, toolbar.top, client.right - 100, toolbar.bottom};
        theme::drawText(hdc, count, r, theme::Muted, app->fonts.textSmall, DT_SINGLELINE | DT_VCENTER | DT_RIGHT);
        app->rRefreshButton = RECT{client.right - 95, toolbar.top + 9, client.right - 15, toolbar.bottom - 9};
        theme::fillRect(hdc, app->rRefreshButton, theme::ButtonBg);
        FrameRect(hdc, &app->rRefreshButton, CreateSolidBrush(theme::ButtonBorder));
        theme::drawText(hdc, L"↻ Refresh", app->rRefreshButton, theme::Text, app->fonts.ui, DT_SINGLELINE | DT_VCENTER | DT_CENTER);
    } else {
        app->rRefreshButton = RECT{0,0,0,0};
    }

    int shellTop = y, shellBottom = client.bottom - theme::FooterHeight - theme::LogHeight;
    RECT shell{0, shellTop, client.right, shellBottom};
    theme::fillRect(hdc, shell, theme::Background);

    int sideLeft = theme::PanelGap, sideRight = sideLeft + theme::SidebarWidth;
    int inspectorRight = client.right - theme::PanelGap, inspectorLeft = inspectorRight - theme::InspectorWidth;
    int tableLeft = sideRight + theme::PanelGap, tableRight = inspectorLeft - theme::PanelGap;

    // --- Sidebar ---
    RECT sidebar{sideLeft, shellTop + theme::PanelGap, sideRight, shellBottom - theme::PanelGap};
    theme::fillRect(hdc, sidebar, theme::Panel);
    FrameRect(hdc, &sidebar, CreateSolidBrush(theme::Border));
    {
        RECT head{sidebar.left, sidebar.top, sidebar.right, sidebar.top + theme::HeadBarHeight};
        theme::fillRect(hdc, head, theme::HeadBarBg);
        theme::strokeRectBottom(hdc, head, theme::Border);
        RECT headText{head.left + 10, head.top, head.right - 10, head.bottom};
        theme::drawText(hdc, L"Library", headText, theme::Text, app->fonts.uiBold, DT_SINGLELINE | DT_VCENTER | DT_LEFT);

        int sy = head.bottom + 12;
        RECT catLabel{sidebar.left + 8, sy, sidebar.right - 8, sy + 16};
        theme::drawText(hdc, L"CATEGORIES", catLabel, theme::Muted, app->fonts.smallBold, DT_SINGLELINE | DT_LEFT);
        sy += 20;
        std::vector<std::wstring> categories = {L"All plugins", L"Sources", L"Plugins", L"Wire"};
        app->sidebarFilterLabels = categories;
        app->sidebarFilterCount = static_cast<int>(categories.size());
        for (int i = 0; i < app->sidebarFilterCount; i++) {
            RECT r{sidebar.left + 4, sy, sidebar.right - 4, sy + 30};
            app->rSidebarFilters[i] = r;
            bool active = (categories[i] == app->activeFilter);
            if (active) theme::fillRect(hdc, r, theme::FilterActiveBg);
            RECT textR{r.left + 8, r.top, r.right - 30, r.bottom};
            theme::drawText(hdc, categories[i], textR, active ? RGB(0xE2,0xEA,0xF6) : theme::Text, app->fonts.ui, DT_SINGLELINE | DT_VCENTER | DT_LEFT);
            sy += 30;
        }
        sy += 12;
        RECT mgmtLabel{sidebar.left + 8, sy, sidebar.right - 8, sy + 16};
        theme::drawText(hdc, L"MANAGEMENT", mgmtLabel, theme::Muted, app->fonts.smallBold, DT_SINGLELINE | DT_LEFT);
        sy += 20;
        for (int i = 1; i < 5; i++) { // My Plugins, Updates, Licenses, Settings (skip Discover, it's the default).
            RECT r{sidebar.left + 8, sy, sidebar.right - 8, sy + 24};
            theme::drawText(hdc, kTabLabels[i], r, theme::Muted, app->fonts.ui, DT_SINGLELINE | DT_VCENTER | DT_LEFT);
            sy += 24;
        }
        RECT bottom{sidebar.left + 8, sidebar.bottom - 70, sidebar.right - 8, sidebar.bottom - 10};
        theme::strokeRectBottom(hdc, RECT{bottom.left, bottom.top - 14, bottom.right, bottom.top - 13}, theme::Border);
        RECT tHostLabel{bottom.left, bottom.top, bottom.right, bottom.top + 14};
        theme::drawText(hdc, L"TARGET SERVER", tHostLabel, theme::Muted, app->fonts.smallBold, DT_SINGLELINE | DT_LEFT);
        std::wstring hostLine = app->originHost + L":" + std::to_wstring(app->originPort);
        RECT tHost{bottom.left, bottom.top + 16, bottom.right, bottom.top + 32};
        theme::drawText(hdc, hostLine, tHost, theme::Text, app->fonts.uiBold, DT_SINGLELINE | DT_LEFT);
    }

    // --- Center: title area + table ---
    RECT center{tableLeft, shellTop + theme::PanelGap, tableRight, shellBottom - theme::PanelGap};
    theme::fillRect(hdc, center, theme::Panel);
    FrameRect(hdc, &center, CreateSolidBrush(theme::Border));
    {
        RECT head{center.left, center.top, center.right, center.top + theme::HeadBarHeight};
        theme::fillRect(hdc, head, theme::HeadBarBg);
        theme::strokeRectBottom(hdc, head, theme::Border);
        std::wstring headLabel = app->tab == Tab::Settings ? L"Preferences" : app->tab == Tab::Licenses ? L"Entitlements" : L"Plugin library";
        RECT headText{head.left + 10, head.top, head.right - 10, head.bottom};
        theme::drawText(hdc, headLabel, headText, theme::Text, app->fonts.uiBold, DT_SINGLELINE | DT_VCENTER | DT_LEFT);

        RECT title{center.left, head.bottom, center.right, head.bottom + theme::TitleAreaHeight};
        theme::fillRect(hdc, title, theme::TitleAreaBg);
        theme::strokeRectBottom(hdc, title, theme::Border);
        static const std::wstring titles[] = {L"Discover plugins", L"My plugins", L"Available updates", L"Licenses & devices", L"Application settings"};
        static const std::wstring subtitles[] = {
            L"Find the tools for your audiovisual workflow.", L"Manage installed plugins and their versions.",
            L"Review new versions before applying changes.", L"Manage your entitlements and device activations.",
            L"Configure host applications and installation preferences."};
        int idx = static_cast<int>(app->tab);
        RECT h1{title.left + 16, title.top + 14, title.right - 16, title.top + 40};
        theme::drawText(hdc, titles[idx], h1, RGB(0xED,0xF0,0xF4), app->fonts.title, DT_SINGLELINE | DT_LEFT);
        RECT sub{title.left + 16, title.top + 42, title.right - 16, title.top + 60};
        theme::drawText(hdc, subtitles[idx], sub, theme::Muted, app->fonts.ui, DT_SINGLELINE | DT_LEFT);

        RECT tableArea{center.left, title.bottom, center.right, center.bottom};

        if (app->tab == Tab::Settings) {
            // Label text only here -- the actual input widgets (email,
            // password, port) are real native EDIT/BUTTON controls
            // positioned by layoutControls() using this exact same
            // offset math, since text entry needs real c‍ursor/IME/
            // selection support rather than being hand-drawn.
            int sy = tableArea.top + 20;
            auto rowLabel = [&](const std::wstring& label) {
                RECT lr{tableArea.left + 16, sy, tableArea.left + 200, sy + 30};
                theme::drawText(hdc, label, lr, theme::Text, app->fonts.ui, DT_SINGLELINE | DT_VCENTER | DT_LEFT);
            };
            RECT groupLabel{tableArea.left + 16, sy, tableArea.right - 16, sy + 20};
            theme::drawText(hdc, L"Account", groupLabel, theme::Muted, app->fonts.smallBold, DT_SINGLELINE | DT_LEFT);
            sy += 40;
            if (!model.signedIn) {
                rowLabel(L"E-mail"); sy += 40;
                rowLabel(L"Senha");
            } else {
                rowLabel(L"Conta ativa: " + toWide(model.currentEmail));
            }
            sy += 40 + 10;
            RECT groupLabel2{tableArea.left + 16, sy, tableArea.right - 16, sy + 20};
            theme::drawText(hdc, L"Conexao Wire/Arena", groupLabel2, theme::Muted, app->fonts.smallBold, DT_SINGLELINE | DT_LEFT);
            sy += 26;
            rowLabel(L"Porta de entrada OSC");
        } else {
            RECT th{tableArea.left, tableArea.top, tableArea.right, tableArea.top + 32};
            theme::fillRect(hdc, th, theme::HeadBarBg);
            theme::strokeRectBottom(hdc, th, theme::Border);
            bool licenses = (app->tab == Tab::Licenses);
            bool discover = (app->tab == Tab::Discover);
            int colPlugin = (int)((tableArea.right - tableArea.left) * 0.46);
            int colSecond = (int)((tableArea.right - tableArea.left) * 0.17);
            int colThird = (int)((tableArea.right - tableArea.left) * 0.20);
            RECT c1{th.left + 9, th.top, th.left + colPlugin, th.bottom};
            theme::drawText(hdc, L"Plugin", c1, RGB(0xAE,0xB2,0xB9), app->fonts.smallBold, DT_SINGLELINE | DT_VCENTER | DT_LEFT);
            RECT c2{c1.right, th.top, c1.right + colSecond, th.bottom};
            theme::drawText(hdc, discover ? L"Price" : licenses ? L"Entitlement" : L"Version", c2, RGB(0xAE,0xB2,0xB9), app->fonts.smallBold, DT_SINGLELINE | DT_VCENTER | DT_LEFT);
            RECT c3{c2.right, th.top, c2.right + colThird, th.bottom};
            theme::drawText(hdc, licenses ? L"Device" : L"Status", c3, RGB(0xAE,0xB2,0xB9), app->fonts.smallBold, DT_SINGLELINE | DT_VCENTER | DT_LEFT);
            RECT c4{c3.right, th.top, tableArea.right - 9, th.bottom};
            theme::drawText(hdc, licenses ? L"Activation" : L"Action", c4, RGB(0xAE,0xB2,0xB9), app->fonts.smallBold, DT_SINGLELINE | DT_VCENTER | DT_RIGHT);

            auto visible = visibleRowIndices(app, model.rows);
            app->rowCount = static_cast<int>(std::min<size_t>(visible.size(), 64));
            int ry = th.bottom;
            for (int vi = 0; vi < app->rowCount; vi++) {
                int idxRow = visible[vi];
                const Row& r = model.rows[idxRow];
                RECT rowRect{tableArea.left, ry, tableArea.right, ry + theme::RowHeight};
                app->rRows[vi] = rowRect;
                if (idxRow == app->selectedRow) {
                    theme::fillRect(hdc, rowRect, theme::Selected);
                    RECT accentBar{rowRect.left, rowRect.top, rowRect.left + 3, rowRect.bottom};
                    theme::fillRect(hdc, accentBar, theme::Accent);
                }
                theme::strokeRectBottom(hdc, rowRect, theme::RowBorder);

                RECT tileR{rowRect.left + 9, rowRect.top + 9, rowRect.left + 9 + 52, rowRect.bottom - 9};
                theme::fillRect(hdc, tileR, theme::TileBg);
                FrameRect(hdc, &tileR, CreateSolidBrush(theme::TileBorder));
                Gdiplus::RectF tileF((float)tileR.left, (float)tileR.top, (float)(tileR.right - tileR.left), (float)(tileR.bottom - tileR.top));
                icons::draw(gfx, icons::glyphForKind(toWide(r.kindLabel)), tileF, Gdiplus::Color(kOpaque, theme::TileIconR, theme::TileIconG, theme::TileIconB), 1.6f);

                RECT nameR{tileR.right + 11, rowRect.top + 12, rowRect.left + colPlugin, rowRect.top + 30};
                theme::drawText(hdc, toWide(r.productName), nameR, RGB(0xE2,0xE5,0xE9), app->fonts.uiBold, DT_SINGLELINE | DT_VCENTER | DT_LEFT);
                RECT descR{tileR.right + 11, rowRect.top + 32, rowRect.left + colPlugin, rowRect.bottom - 8};
                theme::drawText(hdc, toWide(r.kindLabel), descR, RGB(0xA0,0xA6,0xAF), app->fonts.textSmall, DT_SINGLELINE | DT_VCENTER | DT_LEFT);

                RECT col2{rowRect.left + colPlugin, rowRect.top, rowRect.left + colPlugin + colSecond, rowRect.bottom};
                std::wstring col2Text = discover ? money(r.price) : licenses ? L"Licenca ativa" : (r.owned ? toWide(r.item.release) : L"—");
                theme::drawText(hdc, col2Text, col2, theme::Text, app->fonts.ui, DT_SINGLELINE | DT_VCENTER | DT_LEFT);

                RECT col3{col2.right, rowRect.top, col2.right + colThird, rowRect.bottom};
                if (licenses) {
                    std::wstring dev = r.activatedHere ? L"Esta maquina" : L"—";
                    theme::drawText(hdc, dev, col3, theme::Text, app->fonts.ui, DT_SINGLELINE | DT_VCENTER | DT_LEFT);
                } else {
                    theme::drawText(hdc, stateLabel(r), col3, theme::chipColor(stateTone(r)), app->fonts.textSmall, DT_SINGLELINE | DT_VCENTER | DT_LEFT);
                }

                RECT col4{col3.right + 9, rowRect.top + 14, tableArea.right - 9, rowRect.bottom - 14};
                theme::fillRect(hdc, col4, theme::ButtonBg);
                FrameRect(hdc, &col4, CreateSolidBrush(theme::ButtonBorder));
                theme::drawText(hdc, actionLabel(app, r), col4, theme::Text, app->fonts.ui, DT_SINGLELINE | DT_VCENTER | DT_CENTER);

                ry += theme::RowHeight;
            }
            if (app->rowCount == 0) {
                RECT empty{tableArea.left + 20, th.bottom + 20, tableArea.right - 20, th.bottom + 60};
                theme::drawText(hdc, L"No matching plugins.", empty, theme::Muted, app->fonts.ui, DT_SINGLELINE | DT_LEFT);
            }
        }
    }

    // --- Inspector ---
    RECT inspector{inspectorLeft, shellTop + theme::PanelGap, inspectorRight, shellBottom - theme::PanelGap};
    theme::fillRect(hdc, inspector, theme::Panel);
    FrameRect(hdc, &inspector, CreateSolidBrush(theme::Border));
    {
        RECT head{inspector.left, inspector.top, inspector.right, inspector.top + theme::HeadBarHeight};
        theme::fillRect(hdc, head, theme::HeadBarBg);
        theme::strokeRectBottom(hdc, head, theme::Border);
        RECT headText{head.left + 10, head.top, head.right - 70, head.bottom};
        theme::drawText(hdc, L"Details", headText, theme::Text, app->fonts.uiBold, DT_SINGLELINE | DT_VCENTER | DT_LEFT);
        RECT headSmall{head.right - 65, head.top, head.right - 10, head.bottom};
        theme::drawText(hdc, L"Inspector", headSmall, theme::Muted, app->fonts.textSmall, DT_SINGLELINE | DT_VCENTER | DT_RIGHT);

        if (app->tab == Tab::Settings) {
            RECT note{inspector.left + 15, head.bottom + 15, inspector.right - 15, head.bottom + 200};
            theme::drawText(hdc, L"Configuration notes", RECT{note.left, note.top, note.right, note.top+24}, theme::Text, app->fonts.uiBold, DT_SINGLELINE | DT_LEFT);
            RECT body{note.left, note.top + 28, note.right, note.top + 80};
            theme::drawText(hdc, L"A porta OSC conecta o app ao Wire/Arena para o sinal de autorizacao continuar funcionando.", body, RGB(0xAE,0xB4,0xBD), app->fonts.ui, DT_LEFT | DT_WORDBREAK);
        } else if (app->selectedRow >= 0 && app->selectedRow < static_cast<int>(model.rows.size())) {
            const Row& r = model.rows[app->selectedRow];
            RECT hero{inspector.left + 15, head.bottom + 15, inspector.right - 15, head.bottom + 161};
            theme::fillRect(hdc, hero, theme::HeroBg);
            FrameRect(hdc, &hero, CreateSolidBrush(theme::HeroBorder));
            Gdiplus::RectF heroGlyph((float)hero.left + (hero.right-hero.left)/2.0f - 38, (float)hero.top + 20, 77, 64);
            icons::draw(gfx, icons::glyphForKind(toWide(r.kindLabel)), heroGlyph, Gdiplus::Color(kOpaque, theme::TileIconR, theme::TileIconG, theme::TileIconB), 1.2f);
            RECT heroName{hero.left, hero.bottom - 28, hero.right, hero.bottom - 6};
            std::wstring upper = toWide(r.productName);
            std::transform(upper.begin(), upper.end(), upper.begin(), ::towupper);
            theme::drawText(hdc, upper, heroName, RGB(0xC8,0xD5,0xE7), app->fonts.heroName, DT_SINGLELINE | DT_CENTER);

            int dy = hero.bottom + 16;
            RECT nameR{inspector.left + 15, dy, inspector.right - 15, dy + 22}; dy += 24;
            theme::drawText(hdc, toWide(r.productName), nameR, RGB(0xE5,0xE8,0xEC), app->fonts.uiBold, DT_SINGLELINE | DT_LEFT);
            RECT byR{inspector.left + 15, dy, inspector.right - 15, dy + 18}; dy += 24;
            theme::drawText(hdc, L"PLUGNEX · " + toWide(r.kindLabel), byR, theme::Muted, app->fonts.textSmall, DT_SINGLELINE | DT_LEFT);

            app->rMainAction = RECT{inspector.left + 15, dy, inspector.right - 60, dy + 32};
            theme::fillRect(hdc, app->rMainAction, theme::PrimaryBg);
            FrameRect(hdc, &app->rMainAction, CreateSolidBrush(theme::PrimaryBorder));
            theme::drawText(hdc, actionLabel(app, r), app->rMainAction, theme::PrimaryText, app->fonts.uiBold, DT_SINGLELINE | DT_VCENTER | DT_CENTER);
            app->rSecondaryAction = RECT{inspector.right - 50, dy, inspector.right - 15, dy + 32};
            theme::fillRect(hdc, app->rSecondaryAction, theme::ButtonBg);
            FrameRect(hdc, &app->rSecondaryAction, CreateSolidBrush(theme::ButtonBorder));
            theme::drawText(hdc, L"⋯", app->rSecondaryAction, theme::Text, app->fonts.ui, DT_SINGLELINE | DT_VCENTER | DT_CENTER);
            dy += 48;

            RECT compat{inspector.left + 15, dy, inspector.right - 15, dy + 16}; dy += 22;
            theme::drawText(hdc, L"COMPATIBILITY", compat, RGB(0xA3,0xA8,0xB0), app->fonts.smallBold, DT_SINGLELINE | DT_LEFT);
            auto kv = [&](const std::wstring& k, const std::wstring& v) {
                RECT row{inspector.left + 15, dy, inspector.right - 15, dy + 26};
                theme::strokeRectBottom(hdc, row, RGB(0x3B,0x3E,0x44));
                RECT kR{row.left, row.top, row.left + 150, row.bottom};
                theme::drawText(hdc, k, kR, theme::Muted, app->fonts.textSmall, DT_SINGLELINE | DT_VCENTER | DT_LEFT);
                RECT vR{row.left + 150, row.top, row.right, row.bottom};
                theme::drawText(hdc, v, vR, theme::Text, app->fonts.textSmall, DT_SINGLELINE | DT_VCENTER | DT_RIGHT);
                dy += 26;
            };
            kv(L"Target host", L"Resolume Wire/Arena");
            kv(L"Release", r.owned ? toWide(r.item.release) : L"—");
            if (r.owned) kv(L"Vagas", std::to_wstring(r.item.used) + L"/" + std::to_wstring(r.item.seats));

            dy += 6;
            RECT lic{inspector.left + 15, dy, inspector.right - 15, dy + 16}; dy += 22;
            theme::drawText(hdc, L"LICENSE", lic, RGB(0xA3,0xA8,0xB0), app->fonts.smallBold, DT_SINGLELINE | DT_LEFT);
            kv(L"Status", r.owned ? (r.activatedHere ? L"Activated" : L"Not activated") : L"Not owned");
            kv(L"Device", r.activatedHere ? machineLabel() : L"—");

            dy += 10;
            RECT notice{inspector.left + 15, dy, inspector.right - 15, dy + 60};
            theme::fillRect(hdc, notice, theme::NoticeBg);
            FrameRect(hdc, &notice, CreateSolidBrush(theme::NoticeBorder));
            RECT noticeText{notice.left + 10, notice.top + 8, notice.right - 10, notice.bottom - 8};
            theme::drawText(hdc, L"Dados reais da sua conta. Instalacao/ativacao usam o backend de licenciamento.", noticeText, theme::NoticeText, app->fonts.textSmall, DT_LEFT | DT_WORDBREAK);
        } else {
            RECT empty{inspector.left + 15, head.bottom + 20, inspector.right - 15, head.bottom + 60};
            theme::drawText(hdc, L"Selecione um item na lista.", empty, theme::Muted, app->fonts.ui, DT_LEFT | DT_WORDBREAK);
        }
    }

    // --- Log line ---
    RECT log{0, shellBottom, client.right, shellBottom + theme::LogHeight};
    theme::fillRect(hdc, log, RGB(0x24,0x27,0x2B));
    theme::strokeRectBottom(hdc, log, theme::Border);
    RECT logText{log.left + 10, log.top, log.right - 10, log.bottom};
    std::wstring logLine = app->busy ? L"Processando..." : app->statusText;
    theme::drawText(hdc, logLine, logText, theme::Muted, app->fonts.textSmall, DT_SINGLELINE | DT_VCENTER | DT_LEFT);

    // --- Footer ---
    RECT footer{0, client.bottom - theme::FooterHeight, client.right, client.bottom};
    theme::fillRect(hdc, footer, theme::HeaderBg);
    theme::strokeRectBottom(hdc, RECT{footer.left, footer.top - 1, footer.right, footer.top}, theme::Border);
    int ownedCount = static_cast<int>(std::count_if(model.rows.begin(), model.rows.end(), [](const Row& r){ return r.owned; }));
    int updatesCount2 = static_cast<int>(std::count_if(model.rows.begin(), model.rows.end(), [](const Row& r){ return r.installState == catalog_logic::InstallState::UpdateAvailable; }));
    std::wstring footText = std::to_wstring(ownedCount) + L" owned · " + std::to_wstring(updatesCount2) + L" updates";
    RECT footR{footer.left + 15, footer.top, footer.left + 300, footer.bottom};
    theme::drawText(hdc, footText, footR, theme::Muted, app->fonts.textSmall, DT_SINGLELINE | DT_VCENTER | DT_LEFT);
    RECT footR2{footer.right - 260, footer.top, footer.right - 15, footer.bottom};
    theme::drawText(hdc, app->originHost + L":" + std::to_wstring(app->originPort), footR2, theme::Muted, app->fonts.textSmall, DT_SINGLELINE | DT_VCENTER | DT_RIGHT);

    BitBlt(hdcWindow, 0, 0, client.right, client.bottom, hdc, 0, 0, SRCCOPY);
    SelectObject(hdc, oldBmp);
    DeleteObject(bmp);
    DeleteDC(hdc);
}

// ---------------------------------------------------------------------
// Action dispatch: what clicking the main/row action button does per tab,
// mirroring act() in the prototype's JS but against the real backend.
// ---------------------------------------------------------------------
static void performRowAction(AppState* app, HWND hwnd, int rowIndex) {
    auto rows = app->snapshotRows();
    if (rowIndex < 0 || rowIndex >= static_cast<int>(rows.size())) return;
    Row row = rows[rowIndex];

    if (!row.owned) {
        std::wstring scheme = app->originTls ? L"https://" : L"http://";
        std::wstring url = scheme + app->originHost + (app->originPort == (app->originTls ? 443 : 80) ? L"" : L":" + std::to_wstring(app->originPort)) + L"/?produto=" + toWide(row.offerId);
        ShellExecuteW(nullptr, L"open", url.c_str(), nullptr, nullptr, SW_SHOWNORMAL);
        return;
    }

    if (app->tab == Tab::Licenses && row.activatedHere) {
        runAsync(app, hwnd, [app, row]() mutable { deactivateRow(app, row); },
                 [app]() { app->statusText = L"Machine deactivated."; rebuildRows(app); InvalidateRect(app->hwnd, nullptr, FALSE); });
        return;
    }
    if (row.installState == catalog_logic::InstallState::NotInstalled || row.installState == catalog_logic::InstallState::UpdateAvailable) {
        runAsync(app, hwnd, [app, row]() mutable { activateRow(app, row, true); },
                 [app]() { app->statusText = L"Machine activated. Plugin ready to download."; rebuildRows(app); InvalidateRect(app->hwnd, nullptr, FALSE); });
        return;
    }
    // Installed + Download: open the native Save dialog, then stream the
    // real file from the server (same code path as the previous version).
    if (!hasValidLocalProof(app, row.item)) { app->statusText = L"Ative o plugin nesta maquina antes de baixar."; return; }
    std::wstring defaultExt = row.item.isWire ? L".cwired" : L".zip";
    std::wstring defaultName = toWide(row.item.product) + L"--" + toWide(row.item.release) + defaultExt;
    wchar_t fileBuf[MAX_PATH]; wcsncpy_s(fileBuf, defaultName.c_str(), _TRUNCATE);
    OPENFILENAMEW ofn{}; ofn.lStructSize = sizeof(ofn); ofn.hwndOwner = hwnd;
    ofn.lpstrFilter = row.item.isWire ? L"Patch Wire (*.cwired)\0*.cwired\0\0" : L"Pacote do plugin (*.zip)\0*.zip\0\0";
    ofn.lpstrFile = fileBuf; ofn.nMaxFile = MAX_PATH; ofn.Flags = OFN_OVERWRITEPROMPT | OFN_PATHMUSTEXIST;
    ofn.lpstrDefExt = row.item.isWire ? L"cwired" : L"zip";
    if (!GetSaveFileNameW(&ofn)) return;
    std::wstring destination = fileBuf;
    std::string installationKey;
    { std::lock_guard<std::mutex> lock(app->profileMutex); installationKey = app->profile.installationKey; }
    runAsync(app, hwnd, [app, row, destination, installationKey]() {
        json body = row.item.isWire
            ? json{{"licenseId", row.item.licenseId}, {"product", row.item.product}, {"release", row.item.release}, {"installationKey", installationKey}}
            : json{{"serial", row.item.serial}, {"product", row.item.product}, {"release", row.item.release}, {"installationKey", installationKey}};
        std::wstring path = row.item.isWire ? L"/api/wire/download" : L"/api/download";
        app->http->downloadToFile(path, body, destination);
    }, [app]() { app->statusText = L"Download concluido."; InvalidateRect(app->hwnd, nullptr, FALSE); });
}

// ---------------------------------------------------------------------
// Window procedure.
// ---------------------------------------------------------------------
static LRESULT CALLBACK WndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam) {
    AppState* app = reinterpret_cast<AppState*>(GetWindowLongPtrW(hwnd, GWLP_USERDATA));
    switch (msg) {
    case WM_CREATE: {
        auto* cs = reinterpret_cast<CREATESTRUCTW*>(lParam);
        app = reinterpret_cast<AppState*>(cs->lpCreateParams);
        SetWindowLongPtrW(hwnd, GWLP_USERDATA, (LONG_PTR)app);
        app->hwnd = hwnd;
        app->fonts.create();
        app->logoBitmap = loadEmbeddedPng(cs->hInstance, IDR_LOGO_HORIZONTAL);

        // Native controls for the few places real text input / IME /
        // c‍ursor editing is actually needed (login email+password, OSC
        // port, search box). Everything else in the Graphite shell is
        // owner-drawn in paint(); these sit on top of it and are
        // repositioned in layoutControls() below. Using real EDIT controls
        // here (rather than hand-rolling text entry) is the same call the
        // previous plain-Win32-controls version made for these exact
        // fields, and avoids reimplementing IME/selection/clipboard.
        app->editSearch = CreateWindowExW(WS_EX_CLIENTEDGE, L"EDIT", nullptr, WS_CHILD | WS_VISIBLE,
                                           0, 0, 10, 10, hwnd, (HMENU)(INT_PTR)ID_EDIT_SEARCH, cs->hInstance, nullptr);
        app->editLoginEmail = CreateWindowExW(WS_EX_CLIENTEDGE, L"EDIT", nullptr, WS_CHILD,
                                               0, 0, 10, 10, hwnd, (HMENU)(INT_PTR)ID_EDIT_LOGIN_EMAIL, cs->hInstance, nullptr);
        app->editLoginPassword = CreateWindowExW(WS_EX_CLIENTEDGE, L"EDIT", nullptr, WS_CHILD | ES_PASSWORD,
                                                  0, 0, 10, 10, hwnd, (HMENU)(INT_PTR)ID_EDIT_LOGIN_PASSWORD, cs->hInstance, nullptr);
        app->editOscPort = CreateWindowExW(WS_EX_CLIENTEDGE, L"EDIT", nullptr, WS_CHILD | ES_NUMBER,
                                            0, 0, 10, 10, hwnd, (HMENU)(INT_PTR)ID_EDIT_OSC_PORT, cs->hInstance, nullptr);
        app->btnLogin = CreateWindowW(L"BUTTON", L"Entrar", WS_CHILD,
                                       0, 0, 10, 10, hwnd, (HMENU)(INT_PTR)ID_BTN_LOGIN, cs->hInstance, nullptr);
        app->btnLogout = CreateWindowW(L"BUTTON", L"Sair da conta", WS_CHILD,
                                        0, 0, 10, 10, hwnd, (HMENU)(INT_PTR)ID_BTN_LOGOUT, cs->hInstance, nullptr);
        app->btnSaveOscPort = CreateWindowW(L"BUTTON", L"Salvar porta", WS_CHILD,
                                             0, 0, 10, 10, hwnd, (HMENU)(INT_PTR)ID_BTN_SAVE_OSC_PORT, cs->hInstance, nullptr);
        for (HWND c : {app->editSearch, app->editLoginEmail, app->editLoginPassword, app->editOscPort,
                       app->btnLogin, app->btnLogout, app->btnSaveOscPort}) {
            SendMessageW(c, WM_SETFONT, (WPARAM)app->fonts.ui, TRUE);
        }
        SetWindowTextW(app->editOscPort, std::to_wstring(app->profile.oscPort).c_str());
        {
            RECT client; GetClientRect(hwnd, &client);
            layoutControls(app, client);
        }

        runAsync(app, hwnd, [app]() {
            app->http->setCookie(app->profile.sessionCookie);
            loadCatalog(app);
            loadWireKeyIfNeeded(app);
            rebuildRows(app);
        }, [app]() {
            bool signedIn;
            { std::lock_guard<std::mutex> lock(app->modelMutex); signedIn = app->signedIn; }
            app->statusText = signedIn ? L"Catalogo e biblioteca carregados." : L"Catalogo carregado. Entre em Settings para ver suas compras.";
            RECT client; GetClientRect(app->hwnd, &client);
            layoutControls(app, client);
            InvalidateRect(app->hwnd, nullptr, FALSE);
        });

        app->heartbeatRunning = true;
        app->heartbeatThread = std::thread(heartbeatLoop, app);
        SetTimer(hwnd, ID_TIMER_SYNC, 300000, nullptr); // 5 min, matches Manager.cs's prior nextCheck cadence.
        return 0;
    }
    case WM_APP_HEARTBEAT:
        return 0; // heartbeat only sends OSC pulses; no redraw needed every 100ms.
    case WM_APP_ERROR: {
        auto* m = (std::string*)lParam;
        app->statusText = toWide(*m);
        delete m;
        InvalidateRect(hwnd, nullptr, FALSE);
        return 0;
    }
    case WM_APP_WORK_DONE: {
        auto* done = (std::function<void()>*)lParam;
        (*done)();
        delete done;
        app->busy = false;
        InvalidateRect(hwnd, nullptr, FALSE);
        return 0;
    }
    case WM_TIMER: {
        bool signedIn;
        { std::lock_guard<std::mutex> lock(app->modelMutex); signedIn = app->signedIn; }
        if (wParam == ID_TIMER_SYNC && signedIn && !app->busy) {
            runAsync(app, hwnd, [app]() { rebuildRows(app); }, [app]() { InvalidateRect(app->hwnd, nullptr, FALSE); });
        }
        return 0;
    }
    case WM_COMMAND: {
        int id = LOWORD(wParam);
        int notify = HIWORD(wParam);
        if (id == ID_EDIT_SEARCH && notify == EN_CHANGE) {
            wchar_t buf[256]{};
            GetWindowTextW(app->editSearch, buf, 256);
            app->searchQuery = buf;
            app->selectedRow = -1;
            InvalidateRect(hwnd, nullptr, FALSE);
            return 0;
        }
        if (id == ID_BTN_LOGIN && notify == BN_CLICKED) {
            if (app->busy) return 0;
            wchar_t emailBuf[256]{}, passBuf[256]{};
            GetWindowTextW(app->editLoginEmail, emailBuf, 256);
            GetWindowTextW(app->editLoginPassword, passBuf, 256);
            std::string email = toUtf8(emailBuf), password = toUtf8(passBuf);
            if (email.empty() || password.empty()) { app->statusText = L"Informe e-mail e senha."; InvalidateRect(hwnd, nullptr, FALSE); return 0; }
            SetWindowTextW(app->editLoginPassword, L"");
            runAsync(app, hwnd, [app, email, password]() {
                json body = {{"email", email}, {"password", password}};
                app->http->postJson(L"/api/login", body);
                {
                    std::lock_guard<std::mutex> lock(app->profileMutex);
                    if (app->profile.email != email) app->profile.entries.clear();
                    app->profile.email = email;
                    app->profile.sessionCookie = app->http->cookie();
                    app->profileStore->save(app->profile);
                }
                loadCatalog(app);
                loadWireKeyIfNeeded(app);
                rebuildRows(app);
            }, [app]() {
                app->statusText = L"Login efetuado com sucesso.";
                RECT client; GetClientRect(app->hwnd, &client);
                layoutControls(app, client);
                InvalidateRect(app->hwnd, nullptr, FALSE);
            });
            return 0;
        }
        if (id == ID_BTN_LOGOUT && notify == BN_CLICKED) {
            if (app->busy) return 0;
            runAsync(app, hwnd, [app]() {
                {
                    std::lock_guard<std::mutex> lock(app->profileMutex);
                    app->profile.entries.clear();
                    app->profile.email.clear();
                    app->profile.sessionCookie.clear();
                    app->profileStore->save(app->profile);
                }
                try { app->http->postJson(L"/api/logout", json::object()); } catch (...) {}
                app->http->clearCookie();
                {
                    std::lock_guard<std::mutex> lock(app->modelMutex);
                    app->signedIn = false;
                    app->currentEmail.clear();
                    app->rows.clear();
                }
            }, [app]() {
                SetWindowTextW(app->editLoginEmail, L"");
                app->statusText = L"Sessao local encerrada.";
                RECT client; GetClientRect(app->hwnd, &client);
                layoutControls(app, client);
                InvalidateRect(app->hwnd, nullptr, FALSE);
            });
            return 0;
        }
        if (id == ID_BTN_SAVE_OSC_PORT && notify == BN_CLICKED) {
            wchar_t buf[16]{};
            GetWindowTextW(app->editOscPort, buf, 16);
            int port = _wtoi(buf);
            if (port < 1 || port > 65535) { app->statusText = L"Porta invalida (use 1-65535)."; InvalidateRect(hwnd, nullptr, FALSE); return 0; }
            {
                std::lock_guard<std::mutex> lock(app->profileMutex);
                app->profile.oscPort = port;
                app->profileStore->save(app->profile);
            }
            app->statusText = L"Porta OSC salva.";
            InvalidateRect(hwnd, nullptr, FALSE);
            return 0;
        }
        return 0;
    }
    case WM_PAINT: {
        PAINTSTRUCT ps;
        HDC hdc = BeginPaint(hwnd, &ps);
        RECT client; GetClientRect(hwnd, &client);
        paint(app, hdc, client);
        EndPaint(hwnd, &ps);
        return 0;
    }
    case WM_ERASEBKGND:
        return 1; // avoid flicker; paint() fills the whole client area itself.
    case WM_LBUTTONDOWN: {
        if (app->busy) return 0;
        POINT pt{LOWORD(lParam), HIWORD(lParam)};
        for (int i = 0; i < 5; i++) {
            if (PtInRect(&app->rTabs[i], pt)) {
                app->tab = kTabOrder[i];
                app->selectedRow = -1;
                app->activeFilter = L"All plugins";
                RECT client; GetClientRect(hwnd, &client);
                layoutControls(app, client);
                InvalidateRect(hwnd, nullptr, FALSE);
                return 0;
            }
        }
        if (PtInRect(&app->rRefreshButton, pt) && (app->rRefreshButton.right > app->rRefreshButton.left)) {
            runAsync(app, hwnd, [app]() { loadCatalog(app); loadWireKeyIfNeeded(app); rebuildRows(app); },
                     [app]() { app->statusText = L"Catalogo atualizado."; InvalidateRect(app->hwnd, nullptr, FALSE); });
            return 0;
        }
        for (int i = 0; i < app->sidebarFilterCount; i++) {
            if (PtInRect(&app->rSidebarFilters[i], pt)) {
                app->activeFilter = app->sidebarFilterLabels[i];
                InvalidateRect(hwnd, nullptr, FALSE);
                return 0;
            }
        }
        // Recomputed from a fresh snapshot: matches what the most recent
        // paint() drew into app->rRows[] unless rebuildRows() happened to
        // run on a worker thread in between, in which case the click may
        // land one refresh behind what's visually on screen -- a harmless
        // UI quirk, not the data race this snapshot exists to prevent.
        auto rowsSnapshot = app->snapshotRows();
        auto visible = visibleRowIndices(app, rowsSnapshot);
        for (int vi = 0; vi < app->rowCount && vi < static_cast<int>(visible.size()); vi++) {
            if (PtInRect(&app->rRows[vi], pt)) {
                app->selectedRow = visible[vi];
                InvalidateRect(hwnd, nullptr, FALSE);
                return 0;
            }
        }
        if (app->selectedRow >= 0 && PtInRect(&app->rMainAction, pt) && (app->rMainAction.right > app->rMainAction.left)) {
            performRowAction(app, hwnd, app->selectedRow);
            return 0;
        }
        return 0;
    }
    case WM_SIZE: {
        RECT client; GetClientRect(hwnd, &client);
        layoutControls(app, client);
        InvalidateRect(hwnd, nullptr, FALSE);
        return 0;
    }
    case WM_LBUTTONDBLCLK:
        return 0;
    case WM_KEYDOWN:
        if (wParam == VK_F5) {
            runAsync(app, hwnd, [app]() { loadCatalog(app); loadWireKeyIfNeeded(app); rebuildRows(app); },
                     [app]() { InvalidateRect(app->hwnd, nullptr, FALSE); });
        }
        return 0;
    case WM_CLOSE:
        app->heartbeatRunning = false;
        if (app->heartbeatThread.joinable()) app->heartbeatThread.join();
        DestroyWindow(hwnd);
        return 0;
    case WM_DESTROY:
        PostQuitMessage(0);
        return 0;
    }
    return DefWindowProcW(hwnd, msg, wParam, lParam);
}

int WINAPI wWinMain(HINSTANCE hInstance, HINSTANCE, PWSTR, int nCmdShow) {
    HANDLE mutex = CreateMutexW(nullptr, FALSE, L"Local\\PlugnexApp-SingleInstance");
    if (mutex && GetLastError() == ERROR_ALREADY_EXISTS) {
        MessageBoxW(nullptr, L"O PLUGNEX ja esta aberto.", L"PLUGNEX", MB_OK | MB_ICONINFORMATION);
        return 0;
    }

    Gdiplus::GdiplusStartupInput gdiplusStartupInput;
    ULONG_PTR gdiplusToken;
    Gdiplus::GdiplusStartup(&gdiplusToken, &gdiplusStartupInput, nullptr);

    AppState app;
    app.http = std::make_unique<HttpClient>(app.originHost, app.originPort, app.originTls);

    std::string scopeMaterial = toUtf8(app.originHost) + ":" + std::to_string(app.originPort);
    try {
        json keyResp = app.http->getJson(L"/api/public-key");
        scopeMaterial = keyResp.at("key").get<std::string>();
    } catch (...) {}
    std::wstring originForScope = (app.originTls ? L"https://" : L"http://") + app.originHost + L":" + std::to_wstring(app.originPort);
    app.profileStore = std::make_unique<ProfileStore>(originForScope, scopeMaterial);
    app.profile = app.profileStore->load();

    WNDCLASSW wc{};
    wc.lpfnWndProc = WndProc;
    wc.hInstance = hInstance;
    wc.lpszClassName = L"PlugnexAppWindow";
    wc.hCursor = LoadCursorW(nullptr, IDC_ARROW);
    wc.hbrBackground = nullptr; // WM_ERASEBKGND returns 1; paint() owns the whole surface.
    wc.hIcon = LoadIconW(hInstance, MAKEINTRESOURCEW(1));
    RegisterClassW(&wc);

    HWND hwnd = CreateWindowExW(0, L"PlugnexAppWindow", L"PLUGNEX",
                                 WS_OVERLAPPEDWINDOW, CW_USEDEFAULT, CW_USEDEFAULT, 1280, 820,
                                 nullptr, nullptr, hInstance, &app);
    if (!hwnd) return 1;
    ShowWindow(hwnd, nCmdShow);
    UpdateWindow(hwnd);

    MSG msg;
    while (GetMessageW(&msg, nullptr, 0, 0)) {
        TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }

    if (app.logoBitmap) delete app.logoBitmap;
    app.fonts.destroy();
    Gdiplus::GdiplusShutdown(gdiplusToken);
    if (mutex) { ReleaseMutex(mutex); CloseHandle(mutex); }
    return 0;
}
