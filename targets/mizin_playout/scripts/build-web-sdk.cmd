@echo off
rem Builds the pinned local WebRTC monitor dependencies (ADR-017) into binaries\web-sdk\install.
rem Sources: binaries\web-sdk\src (libdatachannel v0.24.6 + submodules, mbedtls v3.6.7, opus v1.5.2).
setlocal
if "%MIZIN_VCVARS%"=="" set MIZIN_VCVARS=C:\Program Files\Microsoft Visual Studio\18\Community\VC\Auxiliary\Build\vcvars64.bat
call "%MIZIN_VCVARS%" >nul 2>nul
if errorlevel 1 exit /b 1
set W=%~dp0..\binaries\web-sdk
set S=%W%\src
set B=%W%\build
set I=%W%\install
rem libdatachannel needs DTLS-SRTP, which Mbed TLS 3.6 leaves disabled by default. Enable it in the
rem shipped config header itself so mbedtls and its consumers see the same feature set.
powershell -NoProfile -Command "$f='%S%\mbedtls\include\mbedtls\mbedtls_config.h';$t=[IO.File]::ReadAllText($f);$n=$t.Replace('//#define MBEDTLS_SSL_DTLS_SRTP','#define MBEDTLS_SSL_DTLS_SRTP');if(-not $n.Contains([char]10+'#define MBEDTLS_SSL_DTLS_SRTP')){exit 1};[IO.File]::WriteAllText($f,$n)" || exit /b 1
cmake -S "%S%\mbedtls" -B "%B%\mbedtls" -G "NMake Makefiles" -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX="%I%" -DENABLE_TESTING=OFF -DENABLE_PROGRAMS=OFF -DUSE_SHARED_MBEDTLS_LIBRARY=OFF -DCMAKE_POSITION_INDEPENDENT_CODE=ON || exit /b 1
cmake --build "%B%\mbedtls" --target install || exit /b 1
cmake -S "%S%\opus" -B "%B%\opus" -G "NMake Makefiles" -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX="%I%" -DOPUS_BUILD_PROGRAMS=OFF -DOPUS_BUILD_TESTING=OFF -DOPUS_BUILD_SHARED_LIBRARY=OFF || exit /b 1
cmake --build "%B%\opus" --target install || exit /b 1
cmake -S "%S%\libdatachannel" -B "%B%\libdatachannel" -G "NMake Makefiles" -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX="%I%" -DCMAKE_PREFIX_PATH="%I%" -DUSE_MBEDTLS=ON -DNO_WEBSOCKET=ON -DNO_EXAMPLES=ON -DNO_TESTS=ON || exit /b 1
cmake --build "%B%\libdatachannel" --target install || exit /b 1
exit /b 0
