// Shared numeric resource IDs between resources/app.rc and main.cpp.
// Kept in one place so rc.exe and cl.exe always agree on the value --
// a mismatch here would compile fine on both sides and fail silently at
// runtime (FindResource returning null for the "wrong" ID).
#pragma once

#define IDR_LOGO_HORIZONTAL 101
