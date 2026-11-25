// Small stroke-based glyphs for the Graphite UI's plugin tiles and hero
// panel, drawn with GDI+ rather than traced from the HTML prototype's
// per-product SVGs (those were illustrative placeholders for invented demo
// products like "Web Arena"/"SRT Receiver" -- drawing them for our real
// catalog, whose products are actual Resolume plugins/apps, would be
// decorative fabrication). Instead each real product maps to one of a
// small set of honest, generic category glyphs based on its catalog
// `kind` string, keeping the same tile/hero visual language the design
// calls for without inventing icons for products that don't have one.
#pragma once

#define NOMINMAX
#include <windows.h>
#include <gdiplus.h>
#include <string>
#include <algorithm>

namespace plugnex::icons {

enum class Glyph { App, Plugin, Wire };

// Picks a glyph from the catalog's own free-text `kind` field (e.g.
// "Aplicativo", "Plugin Wire", "Plugin · DLL e Wire") -- matches real
// strings already present in catalog.json rather than a fabricated taxonomy.
inline Glyph glyphForKind(const std::wstring& kind) {
    auto contains = [&](const wchar_t* needle) { return kind.find(needle) != std::wstring::npos; };
    if (contains(L"Wire")) return Glyph::Wire;
    if (contains(L"Plugin")) return Glyph::Plugin;
    return Glyph::App;
}

// Draws one glyph centered in `bounds`, stroked at `strokeWidth` in `color`.
// Coordinates are in the glyph's own local 32x28 unit box, scaled to fit.
inline void draw(Gdiplus::Graphics& g, Glyph glyph, const Gdiplus::RectF& bounds, Gdiplus::Color color, float strokeWidth) {
    Gdiplus::Pen pen(color, strokeWidth);
    pen.SetLineJoin(Gdiplus::LineJoinRound);
    pen.SetStartCap(Gdiplus::LineCapRound);
    pen.SetEndCap(Gdiplus::LineCapRound);

    // Fit a 32x28 local box into bounds, preserving aspect and centering.
    const float boxW = 32.0f, boxH = 28.0f;
    float scale = std::min(bounds.Width / boxW, bounds.Height / boxH);
    float offX = bounds.X + (bounds.Width - boxW * scale) / 2.0f;
    float offY = bounds.Y + (bounds.Height - boxH * scale) / 2.0f;
    auto P = [&](float x, float y) { return Gdiplus::PointF(offX + x * scale, offY + y * scale); };

    Gdiplus::GraphicsState state = g.Save();
    switch (glyph) {
        case Glyph::App: {
            // Monitor/window glyph: a screen rectangle with a stand.
            Gdiplus::RectF screen(P(4, 4).X, P(4, 4).Y, 24 * scale, 15 * scale);
            g.DrawRectangle(&pen, screen);
            Gdiplus::PointF stand[] = {P(13, 23), P(13, 26), P(19, 26), P(19, 23)};
            g.DrawLines(&pen, stand, 4);
            Gdiplus::PointF base[] = {P(10, 26), P(22, 26)};
            g.DrawLines(&pen, base, 2);
            break;
        }
        case Glyph::Plugin: {
            // Plug/puzzle-ish glyph: a body with two prongs, evoking a
            // plugin that connects into a host -- generic but on-theme
            // for "PLUGNEX" without claiming a specific product identity.
            Gdiplus::RectF body(P(8, 10).X, P(8, 10).Y, 16 * scale, 12 * scale);
            g.DrawRectangle(&pen, body);
            Gdiplus::PointF prong1[] = {P(12, 10), P(12, 5)};
            Gdiplus::PointF prong2[] = {P(20, 10), P(20, 5)};
            g.DrawLines(&pen, prong1, 2);
            g.DrawLines(&pen, prong2, 2);
            Gdiplus::PointF cable[] = {P(16, 22), P(16, 26)};
            g.DrawLines(&pen, cable, 2);
            break;
        }
        case Glyph::Wire: {
            // Waveform-ish glyph: evokes the Wire node-graph/signal domain
            // without redrawing any specific Resolume Wire node icon.
            Gdiplus::PointF wave[] = {P(3, 18), P(9, 10), P(13, 22), P(17, 6), P(21, 20), P(25, 12), P(29, 18)};
            g.DrawLines(&pen, wave, 7);
            break;
        }
    }
    g.Restore(state);
}

} // namespace plugnex::icons
