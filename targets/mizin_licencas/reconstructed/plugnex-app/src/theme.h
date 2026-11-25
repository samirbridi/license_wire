// PLUGNEX "Graphite Edition" theme: exact tokens from
// visual/extracted/PLUGNEX_Graphite/design-tokens.json (the approved
// visual reference in targets/mizin_licencas/visual/), reproduced as GDI
// COLORREF/HBRUSH/HFONT resources for the native Win32 shell.
//
// This header owns *only* presentation constants and small drawing
// helpers (flat rectangles, centered text, state-colored chips) -- no
// business logic, no networking. Kept separate from catalog_logic.h so
// the pure logic stays Win32-free and independently testable, exactly as
// before.
#pragma once

#define NOMINMAX
#include <windows.h>
#include <gdiplus.h>
#include <string>
#include <algorithm>

#pragma comment(lib, "gdiplus.lib")

namespace plugnex::theme {

// --- Color tokens (from design-tokens.json) -----------------------------
inline constexpr COLORREF Background   = RGB(0x20, 0x22, 0x26); // --bg
inline constexpr COLORREF Panel        = RGB(0x29, 0x2C, 0x30); // --panel
inline constexpr COLORREF Well         = RGB(0x19, 0x1B, 0x1E); // --well
inline constexpr COLORREF Border       = RGB(0x41, 0x44, 0x4A); // --edge
inline constexpr COLORREF Text         = RGB(0xD5, 0xD7, 0xDA); // --text
inline constexpr COLORREF Muted        = RGB(0x96, 0x9A, 0xA1); // --muted
inline constexpr COLORREF Accent       = RGB(0x83, 0xA7, 0xE9); // --accent
inline constexpr COLORREF Selected     = RGB(0x30, 0x3E, 0x51); // --selected
inline constexpr COLORREF Success      = RGB(0x78, 0xB6, 0x8C); // --green
inline constexpr COLORREF Warning      = RGB(0xC5, 0xA1, 0x6B); // --amber
inline constexpr COLORREF Danger       = RGB(0xCE, 0x77, 0x77); // --red

// Secondary surfaces derived from the HTML/CSS reference (not in the
// tokens JSON, but present throughout plugnex.html's stylesheet) --
// reproduced at the same literal values so the native shell matches pixel
// for pixel rather than approximating.
inline constexpr COLORREF HeaderBg      = RGB(0x19, 0x1B, 0x1E); // header, footer
inline constexpr COLORREF MenuBg        = RGB(0x25, 0x27, 0x2B); // menu bar, toolbar
inline constexpr COLORREF TabActiveBg   = RGB(0x30, 0x3B, 0x4B); // .tab.active
inline constexpr COLORREF HeadBarBg     = RGB(0x30, 0x33, 0x38); // .head, th
inline constexpr COLORREF TitleAreaBg   = RGB(0x24, 0x27, 0x2B); // .titlearea
inline constexpr COLORREF RowHoverBg    = RGB(0x30, 0x34, 0x3B); // tbody tr:hover
inline constexpr COLORREF RowBorder     = RGB(0x38, 0x3B, 0x40); // td border
inline constexpr COLORREF ButtonBg      = RGB(0x33, 0x36, 0x3B); // button
inline constexpr COLORREF ButtonBorder  = RGB(0x4A, 0x4D, 0x54); // button border
inline constexpr COLORREF ButtonHover   = RGB(0x42, 0x46, 0x4D); // button:hover
inline constexpr COLORREF PrimaryBg     = RGB(0x34, 0x49, 0x68); // button.primary
inline constexpr COLORREF PrimaryBorder = RGB(0x59, 0x77, 0xA4);
inline constexpr COLORREF PrimaryText   = RGB(0xE8, 0xF1, 0xFF);
inline constexpr COLORREF InputBg       = RGB(0x1B, 0x1D, 0x20); // input/select
inline constexpr COLORREF FilterActiveBg= RGB(0x35, 0x43, 0x55); // .filter.active
inline constexpr COLORREF TileBg        = RGB(0x1B, 0x20, 0x28); // icon tile
inline constexpr COLORREF TileBorder    = RGB(0x46, 0x50, 0x62);
inline constexpr COLORREF TileIcon      = RGB(0x9B, 0xB9, 0xE5);
// Pre-split RGB bytes for TileIcon's use as a Gdiplus::Color (icons.h call
// sites): applying GetRValue/GetGValue/GetBValue directly to a constexpr
// COLORREF makes MSVC fold the bitmask at compile time and warn C4310 on
// the resulting literal truncation, even though the macros are correct at
// runtime. Naming the already-split bytes once here avoids that false
// positive without disabling the warning globally.
inline constexpr BYTE TileIconR = 0x9B, TileIconG = 0xB9, TileIconB = 0xE5;
inline constexpr COLORREF HeroBg        = RGB(0x1C, 0x22, 0x2B); // detail hero
inline constexpr COLORREF HeroBorder    = RGB(0x45, 0x50, 0x64);
inline constexpr COLORREF NoticeBg      = RGB(0x24, 0x2A, 0x30); // .notice
inline constexpr COLORREF NoticeBorder  = RGB(0x41, 0x4B, 0x59);
inline constexpr COLORREF NoticeText    = RGB(0xAD, 0xB9, 0xCC);

// --- Layout metrics (from plugnex.html's CSS, pixel-accurate) ----------
inline constexpr int HeaderHeight    = 43;
inline constexpr int MenuHeight      = 29;
inline constexpr int TabsHeight      = 45;
inline constexpr int ToolbarHeight   = 48;
inline constexpr int FooterHeight    = 28;
inline constexpr int LogHeight       = 34;
inline constexpr int SidebarWidth    = 210;
inline constexpr int InspectorWidth  = 350;
inline constexpr int PanelGap        = 5;
inline constexpr int HeadBarHeight   = 32;
inline constexpr int TitleAreaHeight = 70;
inline constexpr int RowHeight       = 58; // approximates the padded <td> row height in the HTML reference.

// --- Fonts ---------------------------------------------------------------
struct Fonts {
    HFONT ui = nullptr;        // 13-14px Segoe UI, body text / table cells.
    HFONT uiBold = nullptr;    // same size, semibold, headings inside rows.
    // Named textSmall rather than "small": windows.h's rpcndr.h #defines
    // the bare identifier `small` to `char` (legacy MIDL base-type alias),
    // so `HFONT small` silently became `HFONT char` and broke the parser
    // with unrelated-looking "missing ';'" errors several lines later.
    HFONT textSmall = nullptr;     // smaller, muted/secondary text, table headers.
    HFONT smallBold = nullptr;     // smaller bold, section labels (COMPATIBILITY, LICENSE).
    HFONT title = nullptr;         // large semibold, view title (h1).
    HFONT heroName = nullptr;      // medium bold, hero caption in the inspector.

    void create() {
        ui = CreateFontW(-14, 0, 0, 0, FW_NORMAL, 0, 0, 0, DEFAULT_CHARSET, OUT_DEFAULT_PRECIS,
                          CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY, DEFAULT_PITCH, L"Segoe UI");
        uiBold = CreateFontW(-14, 0, 0, 0, FW_SEMIBOLD, 0, 0, 0, DEFAULT_CHARSET, OUT_DEFAULT_PRECIS,
                              CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY, DEFAULT_PITCH, L"Segoe UI");
        textSmall = CreateFontW(-12, 0, 0, 0, FW_NORMAL, 0, 0, 0, DEFAULT_CHARSET, OUT_DEFAULT_PRECIS,
                                 CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY, DEFAULT_PITCH, L"Segoe UI");
        smallBold = CreateFontW(-11, 0, 0, 0, FW_SEMIBOLD, 0, 0, 0, DEFAULT_CHARSET, OUT_DEFAULT_PRECIS,
                                 CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY, DEFAULT_PITCH, L"Segoe UI");
        title = CreateFontW(-23, 0, 0, 0, FW_SEMIBOLD, 0, 0, 0, DEFAULT_CHARSET, OUT_DEFAULT_PRECIS,
                             CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY, DEFAULT_PITCH, L"Segoe UI");
        heroName = CreateFontW(-14, 0, 0, 0, FW_SEMIBOLD, 0, 0, 0, DEFAULT_CHARSET, OUT_DEFAULT_PRECIS,
                                CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY, DEFAULT_PITCH, L"Segoe UI");
    }
    void destroy() {
        for (HFONT f : {ui, uiBold, textSmall, smallBold, title, heroName}) if (f) DeleteObject(f);
    }
};

// --- Small GDI drawing helpers -------------------------------------------

inline void fillRect(HDC hdc, const RECT& r, COLORREF color) {
    HBRUSH b = CreateSolidBrush(color);
    FillRect(hdc, &r, b);
    DeleteObject(b);
}

inline void strokeRectBottom(HDC hdc, const RECT& r, COLORREF color) {
    HPEN pen = CreatePen(PS_SOLID, 1, color);
    HPEN old = (HPEN)SelectObject(hdc, pen);
    MoveToEx(hdc, r.left, r.bottom - 1, nullptr);
    LineTo(hdc, r.right, r.bottom - 1);
    SelectObject(hdc, old);
    DeleteObject(pen);
}

inline void drawText(HDC hdc, const std::wstring& text, RECT r, COLORREF color, HFONT font, UINT flags) {
    SetTextColor(hdc, color);
    SetBkMode(hdc, TRANSPARENT);
    HFONT old = (HFONT)SelectObject(hdc, font);
    DrawTextW(hdc, text.c_str(), -1, &r, flags);
    SelectObject(hdc, old);
}

// Renders a tiny status/state chip ("Installed", "Update available", ...)
// with the color convention the prototype uses: green=installed/success,
// amber=update available, muted=not installed/available, accent=special.
enum class ChipTone { Green, Amber, Muted, Accent, Danger };

inline COLORREF chipColor(ChipTone tone) {
    switch (tone) {
        case ChipTone::Green: return Success;
        case ChipTone::Amber: return Warning;
        case ChipTone::Accent: return Accent;
        case ChipTone::Danger: return Danger;
        default: return Muted;
    }
}

} // namespace plugnex::theme
