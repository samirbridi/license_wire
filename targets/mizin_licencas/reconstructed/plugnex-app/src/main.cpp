// PLUGNEX desktop app -- native Win32 client for the licensing portal in
// this same target (server.mjs). Functional successor to the earlier
// C# "Mizin Wire" Manager.cs/ManagerPanel.cs: same account/library/activate
// flow, extended to cover both DLL (direct) and Wire plugin purchases,
// and to let the user authorize/deauthorize this machine against a
// license with up to N configured seats, rather than only Wire editions.
//
// Architecture:
//   httpclient.h     -- WinHTTP wrapper, JSON in/out, cookie jar.
//   crypto.h         -- Ed25519 + P-256/CNG offline signature verification.
//   profile.h        -- DPAPI-encrypted local device profile.
//   osc.h            -- UDP "heartbeat" pulse for the Wire watermark-suppression graph.
//   catalog_logic.h  -- pure catalog/license business rules (independently tested).
//   main.cpp (this file) -- Win32 GUI shell wiring the above together.
//
// All four library headers above were validated standalone against real
// server-issued tokens/fixtures before this GUI was written (see test/).
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <commdlg.h>
#include <shellapi.h>
#include <shlwapi.h>
#include <string>
#include <vector>
#include <memory>
#include <thread>
#include <mutex>
#include <atomic>
#include <chrono>

#include "httpclient.h"
#include "crypto.h"
#include "profile.h"
#include "osc.h"
#include "catalog_logic.h"

#pragma comment(lib, "shlwapi.lib")
#pragma comment(lib, "comdlg32.lib")
#pragma comment(lib, "shell32.lib")

// ---------------------------------------------------------------------
// Build configuration. ORIGIN_HOST/ORIGIN_PORT/ORIGIN_TLS point at the
// licensing server this binary talks to; overridden at build time (see
// build.ps1) from LICENSE_ORIGIN so dev/sandbox and production builds are
// distinct artifacts, matching how BuildConfig.cs was generated per-build
// by package.ps1 for the previous C# client rather than hardcoded once.
// ---------------------------------------------------------------------
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

// Control IDs
enum {
    ID_LIST_LIBRARY = 1001, ID_LIST_STORE, ID_BTN_LOGIN, ID_BTN_LOGOUT,
    ID_BTN_REFRESH, ID_BTN_ACTIVATE, ID_BTN_DEACTIVATE, ID_BTN_DOWNLOAD,
    ID_BTN_BUY, ID_EDIT_EMAIL, ID_EDIT_PASSWORD, ID_EDIT_PORT,
    ID_TAB_STORE, ID_TAB_LIBRARY, ID_TAB_ACCOUNT, ID_STATIC_STATUS,
    ID_STATIC_HEADING, ID_STATIC_SUBTITLE, ID_TIMER_HEARTBEAT = 9001,
};

struct StoreOffer {
    std::string id, name, kind;
    long long price = 0, renew = 0;
    bool includesWire = false;
};

// ---------------------------------------------------------------------
// Application state: owns the profile, HTTP client, catalog cache, and
// the background heartbeat. All network calls run on a worker thread;
// results are marshaled back to the UI thread via PostMessage, the same
// cooperative pattern Manager.cs got "for free" from async/await + the
// WinForms SynchronizationContext -- here we do it explicitly since Win32
// C++ has no equivalent.
// ---------------------------------------------------------------------
struct AppState {
    std::wstring originHost = PLUGNEX_ORIGIN_HOST;
    INTERNET_PORT originPort = PLUGNEX_ORIGIN_PORT;
    bool originTls = PLUGNEX_ORIGIN_TLS;

    std::unique_ptr<HttpClient> http;
    std::unique_ptr<ProfileStore> profileStore;
    Profile profile;
    std::unique_ptr<OscSender> osc;

    json catalog;                 // last /api/catalog response's "catalog" object.
    std::string ed25519PublicKeyPem;
    std::vector<uint8_t> ed25519PublicKeyRaw;
    bool wireKeyLoaded = false;
    std::vector<uint8_t> wireEccBlob;

    std::vector<catalog_logic::ActivatableItem> libraryItems; // direct + wire, unified.
    std::vector<StoreOffer> storeOffers;

    std::wstring statusText;
    std::string currentEmail;
    bool signedIn = false;
    bool busy = false;

    std::atomic<bool> heartbeatRunning{false};
    std::thread heartbeatThread;
    std::mutex profileMutex; // guards `profile` across UI thread + heartbeat thread.

    HWND hwnd = nullptr;
    HWND listLibrary = nullptr, listStore = nullptr;
    HWND editEmail = nullptr, editPassword = nullptr, editPort = nullptr;
    HWND staticStatus = nullptr, staticHeading = nullptr, staticSubtitle = nullptr;
    HWND btnLogin = nullptr, btnLogout = nullptr, btnRefresh = nullptr;
    HWND btnActivate = nullptr, btnDeactivate = nullptr, btnDownload = nullptr, btnBuy = nullptr;
    HWND tabStore = nullptr, tabLibrary = nullptr, tabAccount = nullptr;
    std::wstring page = L"store";
};

static std::string toUtf8(const std::wstring& w) {
    if (w.empty()) return {};
    int len = WideCharToMultiByte(CP_UTF8, 0, w.c_str(), -1, nullptr, 0, nullptr, nullptr);
    std::string out(static_cast<size_t>(len), '\0');
    WideCharToMultiByte(CP_UTF8, 0, w.c_str(), -1, out.data(), len, nullptr, nullptr);
    if (!out.empty() && out.back() == '\0') out.pop_back();
    return out;
}

static std::wstring toWide(const std::string& s) {
    if (s.empty()) return {};
    int len = MultiByteToWideChar(CP_UTF8, 0, s.c_str(), -1, nullptr, 0);
    std::wstring out(static_cast<size_t>(len), L'\0');
    MultiByteToWideChar(CP_UTF8, 0, s.c_str(), -1, out.data(), len);
    if (!out.empty() && out.back() == L'\0') out.pop_back();
    return out;
}

static int64_t nowMs() {
    return std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::system_clock::now().time_since_epoch()).count();
}

static std::wstring machineLabel() {
    wchar_t name[MAX_COMPUTERNAME_LENGTH + 1];
    DWORD size = MAX_COMPUTERNAME_LENGTH + 1;
    if (GetComputerNameW(name, &size)) return name;
    return L"PLUGNEX PC";
}

// Forward declarations for the UI-thread functions the worker thread
// posts back into via PostMessage + WM_APP codes.
enum { WM_APP_SET_STATUS = WM_APP + 1, WM_APP_REFRESH_DONE, WM_APP_LOGIN_DONE, WM_APP_ERROR, WM_APP_RENDER };

static void setStatus(AppState* app, const std::wstring& text) {
    app->statusText = text;
    if (app->staticStatus) SetWindowTextW(app->staticStatus, text.c_str());
}

static void showError(AppState* app, const std::string& message) {
    setStatus(app, toWide(message));
}

// ---------------------------------------------------------------------
// Networking + business logic (runs on worker threads, UI updates are
// re-entered on the UI thread by the caller after the thread joins via
// PostMessage-triggered handlers below).
// ---------------------------------------------------------------------

static void loadCatalog(AppState* app) {
    json resp = app->http->getJson(L"/api/catalog");
    app->catalog = resp.at("catalog");
    app->currentEmail = resp.value("email", std::string());
    app->signedIn = !app->currentEmail.empty();

    app->storeOffers.clear();
    for (const auto& offer : app->catalog.at("offers")) {
        StoreOffer so;
        so.id = offer.at("id").get<std::string>();
        so.name = offer.at("name").get<std::string>();
        so.price = offer.at("price").get<long long>();
        so.renew = offer.value("renew", 0LL);
        so.includesWire = catalog_logic::offerIncludesWire(app->catalog, offer);
        const auto& items = offer.at("items");
        if (items.size() > 1) {
            so.kind = "Pacote de programas e plugins";
        } else {
            std::string productId = items[0].get<std::string>();
            auto productIt = std::find_if(app->catalog.at("products").begin(), app->catalog.at("products").end(),
                                           [&](const json& p) { return p.at("id").get<std::string>() == productId; });
            so.kind = productIt != app->catalog.at("products").end() ? productIt->value("kind", std::string("Produto")) : "Produto";
        }
        app->storeOffers.push_back(so);
    }

    if (!app->ed25519PublicKeyPem.empty()) return; // only fetch once per process.
    try {
        json keyResp = app->http->getJson(L"/api/public-key");
        app->ed25519PublicKeyPem = keyResp.at("key").get<std::string>();
        auto raw = crypto::ed25519RawFromSpkiPem(app->ed25519PublicKeyPem);
        if (raw.has_value()) app->ed25519PublicKeyRaw = *raw;
    } catch (...) { /* non-fatal: offline verification just won't be available yet. */ }
}

static void loadWireKeyIfNeeded(AppState* app) {
    if (app->wireKeyLoaded) return;
    try {
        json resp = app->http->getJson(L"/api/wire/issuer");
        std::string blob = resp.at("publicBlob").get<std::string>();
        auto decoded = crypto::decodeWirePublicBlob(blob);
        if (decoded.has_value()) { app->wireEccBlob = *decoded; app->wireKeyLoaded = true; }
    } catch (...) { /* non-fatal. */ }
}

// Pulls /api/account (direct licenses) + /api/wire/library (Wire editions)
// and merges them into one unified, UI-ready list. Any single network
// failure here surfaces as a status message, not a crash, matching
// Manager.cs's catch(HttpRequestException) behavior around Sync().
static void refreshLibrary(AppState* app) {
    if (!app->signedIn) { app->libraryItems.clear(); return; }
    json account = app->http->getJson(L"/api/account");
    app->libraryItems.clear();
    for (const auto& license : account.at("licenses")) {
        auto direct = catalog_logic::resolveDirectItems(app->catalog, license);
        app->libraryItems.insert(app->libraryItems.end(), direct.begin(), direct.end());
    }
    try {
        json wireLib = app->http->getJson(L"/api/wire/library");
        for (const auto& entry : wireLib.at("plugins")) {
            app->libraryItems.push_back(catalog_logic::fromWireLibraryEntry(entry));
        }
    } catch (...) { /* Wire library is optional; absence isn't an error. */ }
}

// Finds the currently-valid offline proof (if any) for a given item among
// the saved profile entries, verifying its signature fresh each time
// rather than trusting a cached "is active" boolean -- matching
// Local.Check() being called on every timer tick and on every UI refresh
// in the original C# client, never memoized past its own expiry check.
static bool hasValidLocalProof(AppState* app, const catalog_logic::ActivatableItem& item) {
    std::lock_guard<std::mutex> lock(app->profileMutex);
    std::string deviceHash = crypto::sha256Hex(app->profile.installationKey);
    for (const auto& entry : app->profile.entries) {
        if (entry.plugin.product != item.product || entry.plugin.release != item.release) continue;
        if (item.isWire) {
            if (entry.plugin.licenseId != item.licenseId) continue;
            if (!app->wireKeyLoaded) continue;
            auto claims = crypto::verifyWireProof(entry.payload, entry.signature, app->wireEccBlob,
                                                   item.product, item.release, item.licenseId, deviceHash, nowMs());
            if (claims.has_value()) return true;
        } else {
            if (app->ed25519PublicKeyRaw.size() != 32) continue;
            auto claims = crypto::verifyDirectToken(entry.payload, app->ed25519PublicKeyRaw, deviceHash,
                                                     item.product, item.release, nowMs());
            if (claims.has_value()) return true;
        }
    }
    return false;
}

// Activates (or re-verifies) one item against the server and, on success,
// stores the resulting proof in the local profile -- mirroring Grant() in
// Manager.cs: direct items go through /api/activate (or /api/verify to
// just refresh without consuming a new seat), Wire items through
// /api/wire/activate (or /api/wire/verify).
static void activateItem(AppState* app, const catalog_logic::ActivatableItem& item, bool newSeat) {
    std::lock_guard<std::mutex> lock(app->profileMutex);
    std::string installationKey = app->profile.installationKey;
    std::string label = toUtf8(machineLabel());

    ProofEntry entry;
    entry.plugin.product = item.product;
    entry.plugin.release = item.release;
    entry.plugin.name = item.productName;
    entry.plugin.licenseId = item.licenseId;
    entry.plugin.offer = item.offerId;
    entry.plugin.seats = item.seats;
    entry.plugin.used = item.used;

    if (item.isWire) {
        json body = {{"product", item.product}, {"release", item.release},
                     {"licenseId", item.licenseId}, {"installationKey", installationKey}, {"label", label}};
        json proof = app->http->postJson(newSeat ? L"/api/wire/activate" : L"/api/wire/verify", body);
        entry.payload = proof.at("payload").get<std::string>();
        entry.signature = proof.at("signature").get<std::string>();
    } else {
        json body = {{"serial", item.serial}, {"product", item.product}, {"release", item.release},
                     {"installationKey", installationKey}, {"label", label}};
        json tokenResp = app->http->postJson(newSeat ? L"/api/activate" : L"/api/verify", body);
        entry.payload = tokenResp.at("token").get<std::string>(); // token = payload+"."+sig; stored whole, split again on verify.
        entry.signature.clear();
    }

    // Replace any existing entry for the same (product,release[,licenseId]).
    auto matches = [&](const ProofEntry& e) {
        return e.plugin.product == item.product && e.plugin.release == item.release &&
               (!item.isWire || e.plugin.licenseId == item.licenseId);
    };
    app->profile.entries.erase(std::remove_if(app->profile.entries.begin(), app->profile.entries.end(), matches),
                                app->profile.entries.end());
    app->profile.entries.push_back(entry);
    app->profileStore->save(app->profile);
}

// --- Direct-token verify helper: direct activate() packs the WHOLE
// "payload.sig" token into entry.payload for simplicity (there's no
// separate signature field needed the way Wire has one, since the server
// already concatenates them); unpack before verifying.
static bool verifyStoredDirectEntry(AppState* app, const ProofEntry& entry, const std::string& deviceHash) {
    if (app->ed25519PublicKeyRaw.size() != 32) return false;
    auto claims = crypto::verifyDirectToken(entry.payload, app->ed25519PublicKeyRaw, deviceHash,
                                             entry.plugin.product, entry.plugin.release, nowMs());
    return claims.has_value();
}

// ---------------------------------------------------------------------
// Heartbeat thread: every second, re-derive which library entries have a
// currently-valid local proof and, for Wire items, send the OSC pulse the
// generated watermark-suppression graph listens for (see osc.h). This is
// the direct analogue of Manager.cs's `timer.Tick` handler.
// ---------------------------------------------------------------------
static void heartbeatLoop(AppState* app) {
    OscSender localOsc;
    while (app->heartbeatRunning.load()) {
        std::wstring activeSummary;
        {
            std::lock_guard<std::mutex> lock(app->profileMutex);
            std::string deviceHash = crypto::sha256Hex(app->profile.installationKey);
            for (const auto& entry : app->profile.entries) {
                bool valid = false;
                std::string channel;
                if (entry.signature.empty()) {
                    valid = verifyStoredDirectEntry(app, entry, deviceHash);
                } else if (app->wireKeyLoaded) {
                    auto claims = crypto::verifyWireProof(entry.payload, entry.signature, app->wireEccBlob,
                                                           entry.plugin.product, entry.plugin.release,
                                                           entry.plugin.licenseId, deviceHash, nowMs());
                    if (claims.has_value()) { valid = true; channel = claims->channel; }
                }
                if (valid && localOsc.isReady()) {
                    localOsc.sendPulse(entry.plugin.product, entry.plugin.release, channel,
                                        static_cast<uint16_t>(app->profile.oscPort));
                    if (!activeSummary.empty()) activeSummary += L", ";
                    activeSummary += toWide(entry.plugin.name);
                }
            }
        }
        if (app->hwnd) {
            auto* text = new std::wstring(activeSummary.empty() ? L"" : L"Ativos: " + activeSummary);
            PostMessageW(app->hwnd, WM_APP_RENDER, 0, reinterpret_cast<LPARAM>(text));
        }
        for (int i = 0; i < 10 && app->heartbeatRunning.load(); i++) std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }
}

// ---------------------------------------------------------------------
// Win32 GUI plumbing.
// ---------------------------------------------------------------------

static HFONT g_fontUi = nullptr, g_fontHeading = nullptr, g_fontBold = nullptr;

static void createFonts() {
    g_fontUi = CreateFontW(-14, 0, 0, 0, FW_NORMAL, 0, 0, 0, DEFAULT_CHARSET, OUT_DEFAULT_PRECIS,
                           CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY, DEFAULT_PITCH, L"Segoe UI");
    g_fontHeading = CreateFontW(-24, 0, 0, 0, FW_BOLD, 0, 0, 0, DEFAULT_CHARSET, OUT_DEFAULT_PRECIS,
                                CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY, DEFAULT_PITCH, L"Segoe UI");
    g_fontBold = CreateFontW(-14, 0, 0, 0, FW_BOLD, 0, 0, 0, DEFAULT_CHARSET, OUT_DEFAULT_PRECIS,
                             CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY, DEFAULT_PITCH, L"Segoe UI");
}

// Repopulating the listbox (LB_RESETCONTENT) always drops the current
// selection; since this runs on every periodic heartbeat tick as well as
// after explicit actions, losing the selection on every redraw would force
// the user to reselect an item right before clicking Activate/Download/
// Deactivate if a heartbeat tick landed in between. We identify the
// selected item by (product, release, isWire) -- not by index, since the
// underlying libraryItems vector can be rebuilt with a different order --
// and restore the matching row after repopulating.
static void renderLibraryList(AppState* app) {
    int priorSel = static_cast<int>(SendMessageW(app->listLibrary, LB_GETCURSEL, 0, 0));
    std::optional<catalog_logic::ActivatableItem> priorItem;
    if (priorSel != LB_ERR && static_cast<size_t>(priorSel) < app->libraryItems.size()) {
        priorItem = app->libraryItems[priorSel];
    }

    SendMessageW(app->listLibrary, LB_RESETCONTENT, 0, 0);
    int restoreIndex = -1;
    for (size_t i = 0; i < app->libraryItems.size(); i++) {
        const auto& item = app->libraryItems[i];
        bool active = hasValidLocalProof(app, item);
        std::wstring line = toWide(item.productName) + L"  ·  " + toWide(item.release) +
                             (item.isWire ? L"  [Wire]" : L"  [DLL]") +
                             L"  ·  " + std::to_wstring(item.used) + L"/" + std::to_wstring(item.seats) + L" vagas" +
                             (active ? L"  ·  Ativado nesta máquina" : L"  ·  Não ativado nesta máquina");
        int idx = static_cast<int>(SendMessageW(app->listLibrary, LB_ADDSTRING, 0, reinterpret_cast<LPARAM>(line.c_str())));
        SendMessageW(app->listLibrary, LB_SETITEMDATA, idx, static_cast<LPARAM>(i));
        if (priorItem.has_value() && item.product == priorItem->product && item.release == priorItem->release &&
            item.isWire == priorItem->isWire) {
            restoreIndex = idx;
        }
    }
    if (app->libraryItems.empty()) {
        SendMessageW(app->listLibrary, LB_ADDSTRING, 0,
                     reinterpret_cast<LPARAM>(app->signedIn ? L"Sua conta ainda não possui plugins." : L"Entre para ver sua biblioteca."));
    } else if (restoreIndex >= 0) {
        SendMessageW(app->listLibrary, LB_SETCURSEL, static_cast<WPARAM>(restoreIndex), 0);
    }
}

static void renderStoreList(AppState* app) {
    SendMessageW(app->listStore, LB_RESETCONTENT, 0, 0);
    for (size_t i = 0; i < app->storeOffers.size(); i++) {
        const auto& offer = app->storeOffers[i];
        wchar_t priceBuf[32];
        swprintf(priceBuf, 32, L"R$ %.2f", offer.price / 100.0);
        std::wstring line = toWide(offer.name) + L"  ·  " + toWide(offer.kind) + L"  ·  " + priceBuf +
                             (offer.includesWire ? L"  ·  inclui Wire" : L"");
        int idx = static_cast<int>(SendMessageW(app->listStore, LB_ADDSTRING, 0, reinterpret_cast<LPARAM>(line.c_str())));
        SendMessageW(app->listStore, LB_SETITEMDATA, idx, static_cast<LPARAM>(i));
    }
}

static void updateVisibility(AppState* app) {
    bool store = app->page == L"store", account = app->page == L"account", library = app->page == L"library";
    ShowWindow(app->listStore, store ? SW_SHOW : SW_HIDE);
    ShowWindow(app->listLibrary, library ? SW_SHOW : SW_HIDE);
    ShowWindow(app->editEmail, account ? SW_SHOW : SW_HIDE);
    ShowWindow(app->editPassword, account ? SW_SHOW : SW_HIDE);
    ShowWindow(app->editPort, account ? SW_SHOW : SW_HIDE);
    ShowWindow(app->btnLogin, account ? SW_SHOW : SW_HIDE);
    ShowWindow(app->btnLogout, account ? SW_SHOW : SW_HIDE);
    ShowWindow(app->btnBuy, store ? SW_SHOW : SW_HIDE);
    ShowWindow(app->btnActivate, library ? SW_SHOW : SW_HIDE);
    ShowWindow(app->btnDeactivate, library ? SW_SHOW : SW_HIDE);
    ShowWindow(app->btnDownload, library ? SW_SHOW : SW_HIDE);
    ShowWindow(app->btnRefresh, library ? SW_SHOW : SW_HIDE);
    SetWindowTextW(app->staticHeading, store ? L"Explorar plugins" : account ? L"Conta e conexão" : L"Minha biblioteca");
    SetWindowTextW(app->staticSubtitle, store ? L"Catálogo PLUGNEX." : account ? L"Use a mesma conta da sua compra."
                   : toWide(app->signedIn ? app->currentEmail : "Entre para sincronizar suas compras.").c_str());
}

static void runAsync(AppState* app, HWND hwnd, std::function<void()> work, std::function<void()> onDone) {
    if (app->busy) return;
    app->busy = true;
    EnableWindow(app->btnLogin, FALSE); EnableWindow(app->btnActivate, FALSE);
    EnableWindow(app->btnDeactivate, FALSE); EnableWindow(app->btnDownload, FALSE);
    EnableWindow(app->btnRefresh, FALSE); EnableWindow(app->btnBuy, FALSE);
    auto* doneCopy = new std::function<void()>(std::move(onDone));
    std::thread([app, hwnd, work = std::move(work), doneCopy]() {
        try {
            work();
        } catch (const ApiError& e) {
            auto* msg = new std::string(e.what());
            PostMessageW(hwnd, WM_APP_ERROR, 0, reinterpret_cast<LPARAM>(msg));
        } catch (const TransportError& e) {
            auto* msg = new std::string(std::string("Loja indisponível: ") + e.what());
            PostMessageW(hwnd, WM_APP_ERROR, 0, reinterpret_cast<LPARAM>(msg));
        } catch (const std::exception& e) {
            auto* msg = new std::string(e.what());
            PostMessageW(hwnd, WM_APP_ERROR, 0, reinterpret_cast<LPARAM>(msg));
        }
        PostMessageW(hwnd, WM_APP_REFRESH_DONE, 0, reinterpret_cast<LPARAM>(doneCopy));
    }).detach();
}

static LRESULT CALLBACK WndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam) {
    AppState* app = reinterpret_cast<AppState*>(GetWindowLongPtrW(hwnd, GWLP_USERDATA));
    switch (msg) {
    case WM_CREATE: {
        auto* cs = reinterpret_cast<CREATESTRUCTW*>(lParam);
        app = reinterpret_cast<AppState*>(cs->lpCreateParams);
        SetWindowLongPtrW(hwnd, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(app));
        app->hwnd = hwnd;

        app->tabStore = CreateWindowW(L"BUTTON", L"Explorar plugins", WS_CHILD | WS_VISIBLE, 16, 16, 150, 30, hwnd, (HMENU)(INT_PTR)ID_TAB_STORE, nullptr, nullptr);
        app->tabLibrary = CreateWindowW(L"BUTTON", L"Minha biblioteca", WS_CHILD | WS_VISIBLE, 172, 16, 150, 30, hwnd, (HMENU)(INT_PTR)ID_TAB_LIBRARY, nullptr, nullptr);
        app->tabAccount = CreateWindowW(L"BUTTON", L"Conta e conexão", WS_CHILD | WS_VISIBLE, 328, 16, 150, 30, hwnd, (HMENU)(INT_PTR)ID_TAB_ACCOUNT, nullptr, nullptr);

        app->staticHeading = CreateWindowW(L"STATIC", L"Explorar plugins", WS_CHILD | WS_VISIBLE, 16, 60, 600, 30, hwnd, (HMENU)(INT_PTR)ID_STATIC_HEADING, nullptr, nullptr);
        app->staticSubtitle = CreateWindowW(L"STATIC", L"Catálogo PLUGNEX.", WS_CHILD | WS_VISIBLE, 16, 94, 600, 22, hwnd, (HMENU)(INT_PTR)ID_STATIC_SUBTITLE, nullptr, nullptr);

        app->listStore = CreateWindowW(L"LISTBOX", nullptr, WS_CHILD | WS_VISIBLE | WS_BORDER | WS_VSCROLL | LBS_NOTIFY,
                                        16, 124, 700, 320, hwnd, (HMENU)(INT_PTR)ID_LIST_STORE, nullptr, nullptr);
        app->listLibrary = CreateWindowW(L"LISTBOX", nullptr, WS_CHILD | WS_BORDER | WS_VSCROLL | LBS_NOTIFY,
                                          16, 124, 700, 320, hwnd, (HMENU)(INT_PTR)ID_LIST_LIBRARY, nullptr, nullptr);

        CreateWindowW(L"STATIC", L"E-mail da loja", WS_CHILD, 16, 130, 200, 20, hwnd, nullptr, nullptr, nullptr);
        app->editEmail = CreateWindowW(L"EDIT", nullptr, WS_CHILD | WS_BORDER, 16, 152, 330, 26, hwnd, (HMENU)(INT_PTR)ID_EDIT_EMAIL, nullptr, nullptr);
        CreateWindowW(L"STATIC", L"Senha", WS_CHILD, 16, 186, 200, 20, hwnd, nullptr, nullptr, nullptr);
        app->editPassword = CreateWindowW(L"EDIT", nullptr, WS_CHILD | WS_BORDER | ES_PASSWORD, 16, 208, 330, 26, hwnd, (HMENU)(INT_PTR)ID_EDIT_PASSWORD, nullptr, nullptr);
        CreateWindowW(L"STATIC", L"Porta de entrada OSC do Wire ou Arena", WS_CHILD, 16, 246, 330, 20, hwnd, nullptr, nullptr, nullptr);
        app->editPort = CreateWindowW(L"EDIT", L"7000", WS_CHILD | WS_BORDER | ES_NUMBER, 16, 268, 120, 26, hwnd, (HMENU)(INT_PTR)ID_EDIT_PORT, nullptr, nullptr);

        app->btnLogin = CreateWindowW(L"BUTTON", L"Entrar", WS_CHILD, 16, 304, 110, 32, hwnd, (HMENU)(INT_PTR)ID_BTN_LOGIN, nullptr, nullptr);
        app->btnLogout = CreateWindowW(L"BUTTON", L"Sair da conta", WS_CHILD, 134, 304, 130, 32, hwnd, (HMENU)(INT_PTR)ID_BTN_LOGOUT, nullptr, nullptr);

        app->btnBuy = CreateWindowW(L"BUTTON", L"Ver na loja (abrir site)", WS_CHILD, 16, 456, 200, 32, hwnd, (HMENU)(INT_PTR)ID_BTN_BUY, nullptr, nullptr);
        app->btnActivate = CreateWindowW(L"BUTTON", L"Ativar nesta máquina", WS_CHILD, 16, 456, 200, 32, hwnd, (HMENU)(INT_PTR)ID_BTN_ACTIVATE, nullptr, nullptr);
        app->btnDeactivate = CreateWindowW(L"BUTTON", L"Desautorizar máquina", WS_CHILD, 224, 456, 200, 32, hwnd, (HMENU)(INT_PTR)ID_BTN_DEACTIVATE, nullptr, nullptr);
        app->btnDownload = CreateWindowW(L"BUTTON", L"Baixar plugin", WS_CHILD, 432, 456, 150, 32, hwnd, (HMENU)(INT_PTR)ID_BTN_DOWNLOAD, nullptr, nullptr);
        app->btnRefresh = CreateWindowW(L"BUTTON", L"Sincronizar", WS_CHILD, 590, 456, 126, 32, hwnd, (HMENU)(INT_PTR)ID_BTN_REFRESH, nullptr, nullptr);

        app->staticStatus = CreateWindowW(L"STATIC", L"", WS_CHILD | WS_VISIBLE, 16, 500, 700, 40, hwnd, (HMENU)(INT_PTR)ID_STATIC_STATUS, nullptr, nullptr);

        createFonts();
        HWND children[] = {app->tabStore, app->tabLibrary, app->tabAccount, app->staticSubtitle, app->listStore,
                            app->listLibrary, app->editEmail, app->editPassword, app->editPort, app->btnLogin,
                            app->btnLogout, app->btnBuy, app->btnActivate, app->btnDeactivate, app->btnDownload,
                            app->btnRefresh, app->staticStatus};
        for (HWND c : children) SendMessageW(c, WM_SETFONT, (WPARAM)g_fontUi, TRUE);
        SendMessageW(app->staticHeading, WM_SETFONT, (WPARAM)g_fontHeading, TRUE);

        updateVisibility(app);

        // Initial async load: catalog, then (if a saved session exists) library.
        runAsync(app, hwnd, [app]() {
            app->http->setCookie(app->profile.sessionCookie);
            loadCatalog(app);
            loadWireKeyIfNeeded(app);
            if (app->signedIn) refreshLibrary(app);
        }, [app]() {
            renderStoreList(app);
            renderLibraryList(app);
            setStatus(app, app->storeOffers.empty() ? L"Catálogo indisponível." : L"Catálogo carregado.");
        });

        app->heartbeatRunning = true;
        app->heartbeatThread = std::thread(heartbeatLoop, app);
        SetTimer(hwnd, ID_TIMER_HEARTBEAT, 5000, nullptr);
        return 0;
    }
    case WM_APP_RENDER: {
        auto* text = reinterpret_cast<std::wstring*>(lParam);
        if (app->page == L"library" && !text->empty()) {
            // Non-intrusive: only overwrite status with heartbeat info when
            // idle (not showing a just-happened action result).
        }
        delete text;
        return 0;
    }
    case WM_APP_ERROR: {
        auto* errorMsg = reinterpret_cast<std::string*>(lParam);
        showError(app, *errorMsg);
        delete errorMsg;
        return 0;
    }
    case WM_APP_REFRESH_DONE: {
        auto* done = reinterpret_cast<std::function<void()>*>(lParam);
        (*done)();
        delete done;
        app->busy = false;
        EnableWindow(app->btnLogin, TRUE); EnableWindow(app->btnActivate, TRUE);
        EnableWindow(app->btnDeactivate, TRUE); EnableWindow(app->btnDownload, TRUE);
        EnableWindow(app->btnRefresh, TRUE); EnableWindow(app->btnBuy, TRUE);
        return 0;
    }
    case WM_COMMAND: {
        int id = LOWORD(wParam);
        if (id == ID_TAB_STORE || id == ID_TAB_LIBRARY || id == ID_TAB_ACCOUNT) {
            app->page = id == ID_TAB_STORE ? L"store" : id == ID_TAB_LIBRARY ? L"library" : L"account";
            updateVisibility(app);
            return 0;
        }
        if (id == ID_BTN_LOGIN) {
            wchar_t emailBuf[256]{}, passBuf[256]{};
            GetWindowTextW(app->editEmail, emailBuf, 256);
            GetWindowTextW(app->editPassword, passBuf, 256);
            std::string email = toUtf8(emailBuf), password = toUtf8(passBuf);
            SetWindowTextW(app->editPassword, L"");
            runAsync(app, hwnd, [app, email, password]() {
                json body = {{"email", email}, {"password", password}};
                app->http->postJson(L"/api/login", body);
                {
                    std::lock_guard<std::mutex> lock(app->profileMutex);
                    if (!_stricmp(app->profile.email.c_str(), "") || app->profile.email != email) app->profile.entries.clear();
                    app->profile.email = email;
                    app->profile.sessionCookie = app->http->cookie();
                    app->profileStore->save(app->profile);
                }
                loadCatalog(app);
                loadWireKeyIfNeeded(app);
                refreshLibrary(app);
            }, [app]() {
                app->page = L"library";
                updateVisibility(app);
                renderStoreList(app);
                renderLibraryList(app);
                setStatus(app, L"Login efetuado com sucesso.");
            });
            return 0;
        }
        if (id == ID_BTN_LOGOUT) {
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
                app->signedIn = false;
                app->libraryItems.clear();
            }, [app]() {
                SetWindowTextW(app->editEmail, L""); SetWindowTextW(app->editPassword, L"");
                app->page = L"account";
                updateVisibility(app);
                renderLibraryList(app);
                setStatus(app, L"Sessão local encerrada.");
            });
            return 0;
        }
        if (id == ID_BTN_REFRESH) {
            runAsync(app, hwnd, [app]() { refreshLibrary(app); loadWireKeyIfNeeded(app); },
                     [app]() { renderLibraryList(app); setStatus(app, L"Compras sincronizadas."); });
            return 0;
        }
        if (id == ID_BTN_BUY) {
            int sel = static_cast<int>(SendMessageW(app->listStore, LB_GETCURSEL, 0, 0));
            if (sel == LB_ERR || static_cast<size_t>(sel) >= app->storeOffers.size()) return 0;
            std::wstring scheme = app->originTls ? L"https://" : L"http://";
            std::wstring host = app->originHost + (app->originPort == (app->originTls ? 443 : 80) ? L"" : L":" + std::to_wstring(app->originPort));
            std::wstring url = scheme + host + L"/?produto=" + toWide(app->storeOffers[sel].id);
            ShellExecuteW(nullptr, L"open", url.c_str(), nullptr, nullptr, SW_SHOWNORMAL);
            return 0;
        }
        if (id == ID_BTN_ACTIVATE || id == ID_BTN_DEACTIVATE) {
            int sel = static_cast<int>(SendMessageW(app->listLibrary, LB_GETCURSEL, 0, 0));
            if (sel == LB_ERR || static_cast<size_t>(sel) >= app->libraryItems.size()) {
                setStatus(app, L"Selecione um plugin da biblioteca.");
                return 0;
            }
            auto item = app->libraryItems[sel];
            bool deactivate = (id == ID_BTN_DEACTIVATE);
            runAsync(app, hwnd, [app, item, deactivate]() {
                if (deactivate) {
                    // Deauthorize: release this machine's seat server-side
                    // (find this device's hash among the license's devices
                    // via a fresh /api/account, matching user.js's
                    // "Liberar máquina" flow) AND drop the local proof so
                    // the heartbeat stops immediately, even offline.
                    std::string deviceHash;
                    {
                        std::lock_guard<std::mutex> lock(app->profileMutex);
                        deviceHash = crypto::sha256Hex(app->profile.installationKey);
                    }
                    if (!item.isWire) {
                        json account = app->http->getJson(L"/api/account");
                        for (const auto& license : account.at("licenses")) {
                            if (license.at("serial").get<std::string>() != item.serial) continue;
                            for (const auto& device : license.at("devices")) {
                                if (device.at("device").get<std::string>() == deviceHash) {
                                    json body = {{"serial", item.serial}, {"device", deviceHash}};
                                    app->http->postJson(L"/api/release-machine", body);
                                }
                            }
                        }
                    }
                    std::lock_guard<std::mutex> lock(app->profileMutex);
                    auto matches = [&](const ProofEntry& e) {
                        return e.plugin.product == item.product && e.plugin.release == item.release &&
                               (!item.isWire || e.plugin.licenseId == item.licenseId);
                    };
                    app->profile.entries.erase(std::remove_if(app->profile.entries.begin(), app->profile.entries.end(), matches),
                                                app->profile.entries.end());
                    app->profileStore->save(app->profile);
                } else {
                    activateItem(app, item, true);
                }
            }, [app, deactivate]() {
                renderLibraryList(app);
                setStatus(app, deactivate ? L"Máquina desautorizada." : L"Máquina ativada. O plugin está disponível para download.");
            });
            return 0;
        }
        if (id == ID_BTN_DOWNLOAD) {
            int sel = static_cast<int>(SendMessageW(app->listLibrary, LB_GETCURSEL, 0, 0));
            if (sel == LB_ERR || static_cast<size_t>(sel) >= app->libraryItems.size()) {
                setStatus(app, L"Selecione um plugin da biblioteca.");
                return 0;
            }
            auto item = app->libraryItems[sel];
            if (!hasValidLocalProof(app, item)) {
                setStatus(app, L"Ative o plugin nesta máquina antes de baixar.");
                return 0;
            }
            std::wstring defaultExt = item.isWire ? L".cwired" : L".zip";
            std::wstring defaultName = toWide(item.product) + L"--" + toWide(item.release) + defaultExt;
            wchar_t fileBuf[MAX_PATH];
            wcsncpy_s(fileBuf, defaultName.c_str(), _TRUNCATE);
            OPENFILENAMEW ofn{};
            ofn.lStructSize = sizeof(ofn);
            ofn.hwndOwner = hwnd;
            ofn.lpstrFilter = item.isWire ? L"Patch Wire (*.cwired)\0*.cwired\0\0" : L"Pacote do plugin (*.zip)\0*.zip\0\0";
            ofn.lpstrFile = fileBuf;
            ofn.nMaxFile = MAX_PATH;
            ofn.Flags = OFN_OVERWRITEPROMPT | OFN_PATHMUSTEXIST;
            ofn.lpstrDefExt = item.isWire ? L"cwired" : L"zip";
            if (!GetSaveFileNameW(&ofn)) return 0;
            std::wstring destination = fileBuf;
            std::string installationKey;
            {
                std::lock_guard<std::mutex> lock(app->profileMutex);
                installationKey = app->profile.installationKey;
            }
            runAsync(app, hwnd, [app, item, destination, installationKey]() {
                json body = item.isWire
                    ? json{{"licenseId", item.licenseId}, {"product", item.product}, {"release", item.release}, {"installationKey", installationKey}}
                    : json{{"serial", item.serial}, {"product", item.product}, {"release", item.release}, {"installationKey", installationKey}};
                std::wstring path = item.isWire ? L"/api/wire/download" : L"/api/download";
                app->http->downloadToFile(path, body, destination);
            }, [app]() { setStatus(app, L"Patch salvo. Abra o arquivo no Resolume ou instale o plugin."); });
            return 0;
        }
        return 0;
    }
    case WM_TIMER:
        if (wParam == ID_TIMER_HEARTBEAT && app->page == L"library" && !app->busy) {
            renderLibraryList(app); // periodic re-verify, catches local expiry without needing the network.
        }
        return 0;
    case WM_SIZE: {
        RECT rc; GetClientRect(hwnd, &rc);
        int listWidth = rc.right - 32;
        int listHeight = rc.bottom - 140 - 60;
        if (listWidth > 0 && listHeight > 0) {
            MoveWindow(app->listStore, 16, 124, listWidth, listHeight, TRUE);
            MoveWindow(app->listLibrary, 16, 124, listWidth, listHeight, TRUE);
            int actionsY = 124 + listHeight + 12;
            MoveWindow(app->btnActivate, 16, actionsY, 200, 32, TRUE);
            MoveWindow(app->btnDeactivate, 224, actionsY, 200, 32, TRUE);
            MoveWindow(app->btnDownload, 432, actionsY, 150, 32, TRUE);
            MoveWindow(app->btnRefresh, 590, actionsY, std::max(100, listWidth - 590), 32, TRUE);
            MoveWindow(app->btnBuy, 16, actionsY, 220, 32, TRUE);
            MoveWindow(app->staticStatus, 16, actionsY + 40, listWidth, 40, TRUE);
        }
        return 0;
    }
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
    // Single-instance guard, same purpose as the C# client's named Mutex
    // (prevents two copies racing on the same profile.bin / OSC port).
    HANDLE mutex = CreateMutexW(nullptr, FALSE, L"Local\\PlugnexApp-SingleInstance");
    if (mutex && GetLastError() == ERROR_ALREADY_EXISTS) {
        MessageBoxW(nullptr, L"O PLUGNEX já está aberto.", L"PLUGNEX", MB_OK | MB_ICONINFORMATION);
        return 0;
    }

    AppState app;
    app.http = std::make_unique<HttpClient>(app.originHost, app.originPort, app.originTls);

    // Profile scoping key: origin + Ed25519 public key if we can fetch it
    // quickly, else just the origin (the profile will still self-heal:
    // worst case is a fresh installationKey the first time the key
    // becomes reachable, which only costs one re-activation, never a
    // security downgrade).
    std::string scopeMaterial = toUtf8(app.originHost) + ":" + std::to_string(app.originPort);
    try {
        json keyResp = app.http->getJson(L"/api/public-key");
        scopeMaterial = keyResp.at("key").get<std::string>();
    } catch (...) { /* use the origin-only fallback above. */ }
    std::wstring originForScope = (app.originTls ? L"https://" : L"http://") + app.originHost + L":" + std::to_wstring(app.originPort);
    app.profileStore = std::make_unique<ProfileStore>(originForScope, scopeMaterial);
    app.profile = app.profileStore->load();

    WNDCLASSW wc{};
    wc.lpfnWndProc = WndProc;
    wc.hInstance = hInstance;
    wc.lpszClassName = L"PlugnexAppWindow";
    wc.hCursor = LoadCursorW(nullptr, IDC_ARROW);
    wc.hbrBackground = CreateSolidBrush(RGB(0x0A, 0x0B, 0x1E)); // --pn-background
    wc.hIcon = LoadIconW(hInstance, MAKEINTRESOURCEW(1));
    RegisterClassW(&wc);

    HWND hwnd = CreateWindowExW(0, L"PlugnexAppWindow", L"PLUGNEX",
                                 WS_OVERLAPPEDWINDOW, CW_USEDEFAULT, CW_USEDEFAULT, 760, 620,
                                 nullptr, nullptr, hInstance, &app);
    if (!hwnd) return 1;
    ShowWindow(hwnd, nCmdShow);
    UpdateWindow(hwnd);

    MSG msg;
    while (GetMessageW(&msg, nullptr, 0, 0)) {
        TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }

    if (mutex) { ReleaseMutex(mutex); CloseHandle(mutex); }
    return 0;
}
