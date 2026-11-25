// Validates catalog_logic.h against real /api/catalog, /api/account and
// /api/wire/library response bodies captured from a live server.mjs
// instance (see test/README.md for how the fixtures were produced).
#include <iostream>
#include <fstream>
#include <sstream>
#include "../src/catalog_logic.h"

static int failures = 0;
#define CHECK(cond, msg) do { if (!(cond)) { std::cerr << "FAIL: " << msg << " (line " << __LINE__ << ")\n"; failures++; } else { std::cout << "ok: " << msg << "\n"; } } while(0)

static nlohmann::json readJson(const std::string& path) {
    std::ifstream f(path, std::ios::binary);
    std::ostringstream ss;
    ss << f.rdbuf();
    return nlohmann::json::parse(ss.str());
}

int main() {
    using namespace plugnex::catalog_logic;

    auto catalogResp = readJson("catalog_fixture.json");
    auto accountResp = readJson("account_fixture.json");
    auto wireLibResp = readJson("wire_library_fixture.json");
    const auto& cat = catalogResp.at("catalog");

    // --- quoteTotalCents: cross-check against the catalog's own tiers for
    // the "studio" offer price (49500), matching what the server actually
    // charged for quantity=1 in the fixture-generation run.
    auto studioOffer = std::find_if(cat.at("offers").begin(), cat.at("offers").end(),
                                     [](const nlohmann::json& o){ return o.at("id") == "studio"; });
    CHECK(studioOffer != cat.at("offers").end(), "found 'studio' offer in live catalog");
    long long unitPrice = studioOffer->at("price").get<long long>();
    CHECK(quoteTotalCents(cat, unitPrice, 1) == 49500, "quantity=1 quote matches the real order total (49500)");
    CHECK(quoteTotalCents(cat, unitPrice, 2) == static_cast<long long>(2 * unitPrice * 0.9 + 0.5),
          "quantity=2 applies the 10% tier discount");
    CHECK(quoteTotalCents(cat, unitPrice, 5) == static_cast<long long>(5 * unitPrice * 0.8 + 0.5),
          "quantity=5 applies the 20% tier discount");

    // --- resolveDirectItems: the 'studio' license fixture has rights for
    // playout, pdt-to-ppt (both direct-only) and outliner (which has BOTH
    // a direct release 'preview-1' and a Wire release 'wire-preview-1' --
    // the Wire one must be excluded here since it goes through the
    // separate Wire activation/download flow instead).
    const auto& license = accountResp.at("licenses")[0];
    auto directItems = resolveDirectItems(cat, license);
    CHECK(directItems.size() == 3, "three direct-activatable products resolved (playout, pdt-to-ppt, outliner)");

    bool foundPlayout = false, foundPdt = false, foundOutliner = false;
    for (const auto& item : directItems) {
        CHECK(item.serial == license.at("serial").get<std::string>(), "resolved item carries the license serial");
        CHECK(!item.isWire, "direct item is not marked as Wire");
        if (item.product == "playout") { foundPlayout = true; CHECK(item.release == "preview-1", "playout resolves to preview-1"); }
        if (item.product == "pdt-to-ppt") { foundPdt = true; CHECK(item.release == "preview-1", "pdt-to-ppt resolves to preview-1"); }
        if (item.product == "outliner") {
            foundOutliner = true;
            CHECK(item.release == "preview-1", "outliner's DIRECT item resolves to preview-1, not the Wire release wire-preview-1");
        }
    }
    CHECK(foundPlayout && foundPdt && foundOutliner, "all three expected products were found in resolved direct items");

    // --- fromWireLibraryEntry: the same 'outliner' purchase's Wire release
    // comes through the separate /api/wire/library endpoint.
    CHECK(wireLibResp.at("plugins").size() == 1, "exactly one Wire-eligible plugin in the live fixture");
    auto wireItem = fromWireLibraryEntry(wireLibResp.at("plugins")[0]);
    CHECK(wireItem.isWire, "wire library entry is marked as Wire");
    CHECK(wireItem.product == "outliner", "wire item product is outliner");
    CHECK(wireItem.release == "wire-preview-1", "wire item release is the Wire-specific release, distinct from the direct one");
    CHECK(!wireItem.licenseId.empty(), "wire item carries a licenseId (needed for /api/wire/activate)");

    // --- offerIncludesWire: 'studio' bundles outliner (which has
    // wireReleases), so it should be flagged; 'playout' alone should not.
    CHECK(offerIncludesWire(cat, *studioOffer), "'studio' offer is flagged as including a Wire-eligible product");
    auto playoutOffer = std::find_if(cat.at("offers").begin(), cat.at("offers").end(),
                                      [](const nlohmann::json& o){ return o.at("id") == "playout"; });
    CHECK(playoutOffer != cat.at("offers").end(), "found 'playout' offer");
    CHECK(!offerIncludesWire(cat, *playoutOffer), "'playout' offer alone is NOT flagged as Wire-eligible");

    std::cout << "\n" << (failures == 0 ? "ALL PASS" : "FAILURES: " + std::to_string(failures)) << "\n";
    return failures == 0 ? 0 : 1;
}
