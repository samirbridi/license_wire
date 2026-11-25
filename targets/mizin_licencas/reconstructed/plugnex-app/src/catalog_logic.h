// Pure catalog/license business logic shared by the PLUGNEX app's UI.
// No Win32 dependency here by design, so it can be exercised directly in
// tests against real /api/catalog + /api/account response shapes.
#pragma once

#include <string>
#include <vector>
#include <algorithm>
#include "../vendor/json.hpp"

namespace plugnex::catalog_logic {

using nlohmann::json;

// Price quote for a given quantity, replicating the tier-discount math in
// public/app.js's quote() (and the authoritative server-side calculation in
// licensing.mjs's order()): pick the highest tier whose `from` is <= qty,
// apply its percentage discount to qty * unitPriceCents, rounding like
// Math.round (banker's rounding is not used server-side either).
inline long long quoteTotalCents(const json& catalogJson, long long unitPriceCents, int quantity) {
    const auto& tiers = catalogJson.at("tiers");
    int bestFrom = -1;
    int discount = 0;
    for (const auto& t : tiers) {
        int from = t.at("from").get<int>();
        if (quantity >= from && from > bestFrom) {
            bestFrom = from;
            discount = t.at("discount").get<int>();
        }
    }
    double raw = static_cast<double>(quantity) * static_cast<double>(unitPriceCents) * (100.0 - discount) / 100.0;
    return static_cast<long long>(raw + 0.5);
}

// One row the UI can render directly, combining account + catalog data for
// either a direct (DLL) or Wire-edition activatable item.
struct ActivatableItem {
    std::string serial;       // owning license serial (needed for direct /api/activate + release-machine).
    std::string licenseId;    // digest(serial); needed for Wire /api/wire/activate (wireManager resolves serial from this + owner).
    std::string offerId;
    std::string product;
    std::string productName;
    std::string release;
    bool isWire = false;
    int seats = 0;
    int used = 0;
};

// Resolves which (product, release) pairs a license's `rights` make
// eligible for *direct* (non-Wire) activation: a release counts if it is
// listed in catalog.products[id].releases, is NOT one of that product's
// wireReleases (those go through the Wire flow instead, with a different
// activation/download path), and its publish date doesn't exceed the
// rights' `until` cutoff (mirrors the `until && item.releases[release] >
// until` rejection in licensing.mjs's authorize()). When multiple eligible
// releases exist, the latest (lexicographically largest ISO date) wins,
// matching "a versão mais recente permitida pela cobertura".
inline std::vector<ActivatableItem> resolveDirectItems(const json& catalogJson, const json& license) {
    std::vector<ActivatableItem> result;
    std::string serial = license.at("serial").get<std::string>();
    const auto& rights = license.at("rights");
    int seats = license.at("seats").get<int>();
    int used = static_cast<int>(license.at("devices").size());
    for (auto it = rights.begin(); it != rights.end(); ++it) {
        std::string productId = it.key();
        auto productIt = std::find_if(catalogJson.at("products").begin(), catalogJson.at("products").end(),
                                       [&](const json& p) { return p.at("id").get<std::string>() == productId; });
        if (productIt == catalogJson.at("products").end()) continue;
        const json& product = *productIt;
        std::vector<std::string> wireReleases;
        if (product.contains("wireReleases")) {
            for (const auto& r : product["wireReleases"]) wireReleases.push_back(r.get<std::string>());
        }
        std::string untilStr;
        bool hasUntil = it.value().contains("until") && !it.value()["until"].is_null();
        if (hasUntil) untilStr = it.value()["until"].get<std::string>();

        std::string bestRelease, bestDate;
        if (product.contains("releases")) {
            for (auto relIt = product["releases"].begin(); relIt != product["releases"].end(); ++relIt) {
                std::string release = relIt.key();
                std::string date = relIt.value().get<std::string>();
                if (std::find(wireReleases.begin(), wireReleases.end(), release) != wireReleases.end()) continue;
                if (hasUntil && date > untilStr) continue;
                if (bestRelease.empty() || date > bestDate) { bestRelease = release; bestDate = date; }
            }
        }
        if (bestRelease.empty()) continue;
        ActivatableItem item;
        item.serial = serial;
        item.offerId = license.at("offer").get<std::string>();
        item.product = productId;
        item.productName = product.at("name").get<std::string>();
        item.release = bestRelease;
        item.isWire = false;
        item.seats = seats;
        item.used = used;
        result.push_back(item);
    }
    return result;
}

// Converts a GET /api/wire/library response entry (already resolved
// server-side by wireManager.library()) into the same ActivatableItem shape,
// so the UI can render direct and Wire items in one unified list.
inline ActivatableItem fromWireLibraryEntry(const json& entry) {
    ActivatableItem item;
    item.licenseId = entry.at("licenseId").get<std::string>();
    item.product = entry.at("product").get<std::string>();
    item.productName = entry.at("name").get<std::string>();
    item.release = entry.at("release").get<std::string>();
    item.isWire = true;
    item.seats = entry.at("seats").get<int>();
    item.used = entry.at("used").get<int>();
    return item;
}

// Whether any product in an offer's bundle grants Wire-edition access at
// all (used to decide whether to show the "Wire" hint/app-download link on
// a store card, mirroring wireInfo() in public/app.js).
inline bool offerIncludesWire(const json& catalogJson, const json& offer) {
    for (const auto& productId : offer.at("items")) {
        auto productIt = std::find_if(catalogJson.at("products").begin(), catalogJson.at("products").end(),
                                       [&](const json& p) { return p.at("id").get<std::string>() == productId.get<std::string>(); });
        if (productIt != catalogJson.at("products").end() && productIt->contains("wireReleases") &&
            !(*productIt)["wireReleases"].empty()) {
            return true;
        }
    }
    return false;
}

} // namespace plugnex::catalog_logic
