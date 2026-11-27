// Exercises the actual runAsync/WM_APP_* implementation without networking
// or profile writes. From the app root in an x64 MSVC developer prompt:
// cl /std:c++17 /EHsc /O2 /W4 /utf-8 /nologo /DUNICODE /D_UNICODE test\test_async_ui.cpp vendor\ed25519\sha512.c vendor\ed25519\fe.c vendor\ed25519\ge.c vendor\ed25519\sc.c vendor\ed25519\verify.c bcrypt.lib crypt32.lib shell32.lib ole32.lib shlwapi.lib comdlg32.lib ws2_32.lib winhttp.lib user32.lib gdi32.lib gdiplus.lib /Fe:build\test_async_ui.exe /Fo:build\ /link /SUBSYSTEM:CONSOLE
// Then run build\test_async_ui.exe.
#include "../src/main.cpp"
#include <iostream>
#include <stdexcept>

static LRESULT CALLBACK TestWindowProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam) {
    if (msg == WM_APP_ERROR || msg == WM_APP_WORK_DONE) return WndProc(hwnd, msg, wParam, lParam);
    return DefWindowProcW(hwnd, msg, wParam, lParam);
}

static void check(bool condition, const char* message) {
    if (!condition) throw std::runtime_error(message);
    std::cout << "PASS: " << message << '\n';
}

static void waitForWorker(AppState& app) {
    ULONGLONG deadline = GetTickCount64() + 5000;
    while (app.busy && GetTickCount64() < deadline) {
        MSG message;
        while (PeekMessageW(&message, nullptr, 0, 0, PM_REMOVE)) {
            TranslateMessage(&message);
            DispatchMessageW(&message);
        }
        if (app.busy) MsgWaitForMultipleObjects(0, nullptr, FALSE, 25, QS_ALLINPUT);
    }
    check(!app.busy, "worker completes and clears the busy flag");
}

int main() {
    AppState app;
    WNDCLASSW cls{};
    cls.lpfnWndProc = TestWindowProc;
    cls.hInstance = GetModuleHandleW(nullptr);
    cls.lpszClassName = L"PlugnexAsyncUiTest";
    RegisterClassW(&cls);
    app.hwnd = CreateWindowW(cls.lpszClassName, L"Async UI test", 0, 0, 0, 400, 100,
                             nullptr, nullptr, cls.hInstance, nullptr);
    SetWindowLongPtrW(app.hwnd, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(&app));
    app.btnRefresh = CreateWindowW(L"BUTTON", L"Atualizar catálogo", WS_CHILD, 0, 0, 180, 32,
                                   app.hwnd, nullptr, cls.hInstance, nullptr);
    int callbacks = 0;
    try {
        check(app.hwnd && app.btnRefresh, "test owns an isolated window and refresh button");
        runAsync(&app, app.hwnd, []() {}, [&]() { ++callbacks; app.statusText = L"OK"; });
        check(app.busy && !IsWindowEnabled(app.btnRefresh), "refresh is disabled during work");
        runAsync(&app, app.hwnd, []() {}, [&]() { callbacks += 100; });
        waitForWorker(app);
        check(callbacks == 1, "success callback runs once; duplicate work is ignored");
        check(IsWindowEnabled(app.btnRefresh) != FALSE, "refresh is enabled after success");

        runAsync(&app, app.hwnd, []() { throw TransportError("connection failed"); }, [&]() { ++callbacks; });
        waitForWorker(app);
        check(callbacks == 1, "transport failure does not run the success callback");
        check(app.statusText.find(L"connection failed") != std::wstring::npos, "transport error is preserved in the UI");
        check(IsWindowEnabled(app.btnRefresh) != FALSE, "refresh is enabled after transport failure");

        runAsync(&app, app.hwnd, []() { throw ApiError(503, "catalog unavailable"); }, [&]() { ++callbacks; });
        waitForWorker(app);
        check(callbacks == 1 && app.statusText == L"catalog unavailable", "API error is not overwritten by false success");
        check(IsWindowEnabled(app.btnRefresh) != FALSE, "refresh is enabled after API failure");
        wchar_t label[64]{};
        GetWindowTextW(app.btnRefresh, label, 64);
        check(std::wstring(label) == L"Atualizar catálogo", "refresh label is restored after failure");
        DestroyWindow(app.hwnd);
        return 0;
    } catch (const std::exception& error) {
        std::cerr << "FAIL: " << error.what() << '\n';
        DestroyWindow(app.hwnd);
        return 1;
    }
}
