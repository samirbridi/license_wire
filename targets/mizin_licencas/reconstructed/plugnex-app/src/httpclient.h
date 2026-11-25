// HTTP client for the PLUGNEX desktop app, built on WinHTTP (no external deps).
// Mirrors the semantics the C# "Mizin Wire" manager used with HttpClient:
// cookie-jar persistence across requests, JSON request/response bodies,
// and a distinct path for binary downloads (streamed to a temp file then
// renamed into place, matching the atomic-write pattern server.mjs's own
// clients rely on elsewhere in this codebase).
#pragma once

#include <windows.h>
#include <winhttp.h>
#include <string>
#include <optional>
#include <stdexcept>
#include <tuple>

#include "../vendor/json.hpp"

namespace plugnex {

struct ApiError : std::runtime_error {
    int status;
    ApiError(int status_, const std::string& message) : std::runtime_error(message), status(status_) {}
};

// Thrown when the network/transport itself fails (DNS, TCP, TLS) rather than
// the server returning a well-formed error payload. The UI treats this
// differently: offline tokens are still trusted, matching Manager.cs's
// "Loja indisponível. Consulte a validade offline acima." behavior.
struct TransportError : std::runtime_error {
    explicit TransportError(const std::string& message) : std::runtime_error(message) {}
};

class HttpClient {
public:
    HttpClient(std::wstring host, INTERNET_PORT port, bool useTls)
        : host_(std::move(host)), port_(port), useTls_(useTls) {
        session_ = WinHttpOpen(L"Plugnex-App/1.0",
                                WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY,
                                WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
        if (!session_) throw TransportError("Não foi possível iniciar o cliente HTTP.");
        // Matches HttpClient's Timeout=TimeSpan.FromSeconds(8) in Manager.cs.
        WinHttpSetTimeouts(session_, 8000, 8000, 8000, 8000);
    }

    ~HttpClient() {
        if (session_) WinHttpCloseHandle(session_);
    }

    HttpClient(const HttpClient&) = delete;
    HttpClient& operator=(const HttpClient&) = delete;

    void setCookie(const std::string& cookie) { cookie_ = cookie; }
    const std::string& cookie() const { return cookie_; }
    void clearCookie() { cookie_.clear(); }

    // GET a JSON API path (e.g. "/api/account"). Throws ApiError on a
    // well-formed {"error": "..."} response, TransportError on network
    // failure, or returns the parsed JSON body on 2xx.
    nlohmann::json getJson(const std::wstring& path) {
        auto [status, body, contentType] = request(L"GET", path, std::nullopt, L"");
        (void)contentType;
        return parseJsonOrThrow(status, body);
    }

    // POST a JSON API path with a JSON body.
    nlohmann::json postJson(const std::wstring& path, const nlohmann::json& payload) {
        std::string bodyUtf8 = payload.dump();
        auto [status, body, contentType] = request(L"POST", path, bodyUtf8, L"application/json");
        (void)contentType;
        return parseJsonOrThrow(status, body);
    }

    // Downloads a binary resource via POST+JSON body, streaming the
    // response directly to destinationPath using a temp-file-then-rename
    // sequence (same crash-safety property File.Replace/.Move gave the
    // C# client; see Manager.cs Download()).
    void downloadToFile(const std::wstring& path, const nlohmann::json& payload, const std::wstring& destinationPath) {
        std::string bodyUtf8 = payload.dump();
        auto [status, body, contentType] = request(L"POST", path, bodyUtf8, L"application/json");
        (void)contentType;
        if (status < 200 || status >= 300) {
            parseJsonOrThrow(status, body); // throws ApiError with the server's message
        }
        std::wstring temp = destinationPath + L"." + std::to_wstring(GetCurrentProcessId()) + L".tmp";
        {
            HANDLE file = CreateFileW(temp.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
            if (file == INVALID_HANDLE_VALUE) throw TransportError("Não foi possível criar o arquivo de destino.");
            DWORD written = 0;
            BOOL ok = WriteFile(file, body.data(), static_cast<DWORD>(body.size()), &written, nullptr);
            CloseHandle(file);
            if (!ok || written != body.size()) {
                DeleteFileW(temp.c_str());
                throw TransportError("Falha ao gravar o arquivo baixado.");
            }
        }
        if (!MoveFileExW(temp.c_str(), destinationPath.c_str(), MOVEFILE_REPLACE_EXISTING)) {
            DeleteFileW(temp.c_str());
            throw TransportError("Falha ao mover o arquivo baixado para o destino final.");
        }
    }

private:
    nlohmann::json parseJsonOrThrow(int status, const std::string& body) {
        nlohmann::json parsed;
        try {
            parsed = body.empty() ? nlohmann::json::object() : nlohmann::json::parse(body);
        } catch (...) {
            if (status >= 200 && status < 300) throw ApiError(status, "Resposta inválida do servidor.");
            throw ApiError(status, "Falha na loja.");
        }
        if (status < 200 || status >= 300) {
            std::string message = parsed.value("error", std::string("Falha na loja."));
            throw ApiError(status, message);
        }
        return parsed;
    }

    // Returns {statusCode, bodyBytes, contentType}.
    std::tuple<int, std::string, std::wstring> request(const std::wstring& method, const std::wstring& path,
                                                         std::optional<std::string> body, const std::wstring& contentType) {
        HINTERNET connect = WinHttpConnect(session_, host_.c_str(), port_, 0);
        if (!connect) throw TransportError("Não foi possível conectar à loja.");
        DWORD flags = useTls_ ? WINHTTP_FLAG_SECURE : 0;
        HINTERNET req = WinHttpOpenRequest(connect, method.c_str(), path.c_str(), nullptr,
                                            WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, flags);
        if (!req) { WinHttpCloseHandle(connect); throw TransportError("Não foi possível preparar a requisição."); }

        std::wstring headers;
        if (!contentType.empty()) headers += L"Content-Type: " + contentType + L"\r\n";
        if (!cookie_.empty()) {
            std::wstring wCookie(cookie_.begin(), cookie_.end());
            headers += L"Cookie: " + wCookie + L"\r\n";
        }
        if (!headers.empty()) {
            WinHttpAddRequestHeaders(req, headers.c_str(), static_cast<DWORD>(headers.size()),
                                      WINHTTP_ADDREQ_FLAG_ADD);
        }

        const void* sendData = body.has_value() ? body->data() : nullptr;
        DWORD sendLen = body.has_value() ? static_cast<DWORD>(body->size()) : 0;
        BOOL sent = WinHttpSendRequest(req, WINHTTP_NO_ADDITIONAL_HEADERS, 0,
                                        const_cast<void*>(sendData), sendLen, sendLen, 0);
        if (!sent || !WinHttpReceiveResponse(req, nullptr)) {
            WinHttpCloseHandle(req); WinHttpCloseHandle(connect);
            throw TransportError("A loja não respondeu a tempo.");
        }

        DWORD statusCode = 0, statusSize = sizeof(statusCode);
        WinHttpQueryHeaders(req, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
                             WINHTTP_HEADER_NAME_BY_INDEX, &statusCode, &statusSize, WINHTTP_NO_HEADER_INDEX);

        // Capture Set-Cookie (session token) if present; strip attributes,
        // keep only "name=value" the way CookieContainer exposed it to us before.
        std::wstring setCookieHeader = queryHeader(req, WINHTTP_QUERY_SET_COOKIE);
        if (!setCookieHeader.empty()) {
            std::wstring firstPair = setCookieHeader.substr(0, setCookieHeader.find(L';'));
            cookie_ = wideToUtf8(firstPair);
        }

        std::string responseBody;
        DWORD available = 0;
        while (WinHttpQueryDataAvailable(req, &available) && available > 0) {
            std::string chunk(available, '\0');
            DWORD read = 0;
            if (!WinHttpReadData(req, chunk.data(), available, &read)) break;
            chunk.resize(read);
            responseBody += chunk;
        }

        WinHttpCloseHandle(req);
        WinHttpCloseHandle(connect);
        return {static_cast<int>(statusCode), responseBody, L""};
    }

    std::wstring queryHeader(HINTERNET req, DWORD infoLevel) {
        DWORD size = 0;
        WinHttpQueryHeaders(req, infoLevel, WINHTTP_HEADER_NAME_BY_INDEX, WINHTTP_NO_OUTPUT_BUFFER, &size, WINHTTP_NO_HEADER_INDEX);
        if (GetLastError() != ERROR_INSUFFICIENT_BUFFER || size == 0) return L"";
        std::wstring buffer(size / sizeof(wchar_t), L'\0');
        if (!WinHttpQueryHeaders(req, infoLevel, WINHTTP_HEADER_NAME_BY_INDEX, buffer.data(), &size, WINHTTP_NO_HEADER_INDEX)) return L"";
        buffer.resize(wcslen(buffer.c_str()));
        return buffer;
    }

    static std::string wideToUtf8(const std::wstring& w) {
        if (w.empty()) return {};
        int len = WideCharToMultiByte(CP_UTF8, 0, w.c_str(), static_cast<int>(w.size()), nullptr, 0, nullptr, nullptr);
        std::string out(static_cast<size_t>(len), '\0');
        WideCharToMultiByte(CP_UTF8, 0, w.c_str(), static_cast<int>(w.size()), out.data(), len, nullptr, nullptr);
        return out;
    }

    HINTERNET session_ = nullptr;
    std::wstring host_;
    INTERNET_PORT port_;
    bool useTls_;
    std::string cookie_;
};

} // namespace plugnex
