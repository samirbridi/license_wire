@echo off
call "%MIZIN_VCVARS%" >nul
if errorlevel 1 exit /b 1
cmake -S "%~1" -B "%~2" -G "NMake Makefiles" -DCMAKE_BUILD_TYPE=Release -DCMAKE_PREFIX_PATH="%~3" -DMIZIN_ENABLE_ASIO=OFF
if errorlevel 1 exit /b 1
rem Official builds never include ASIO: publishing it needs a Steinberg-signed licence (ADR-018).
rem Always rebuild headers on the localized MSVC/NMake toolchain.
rem Its include dependency scan can omit header changes and retain incompatible objects.
cmake --build "%~2" --config Release --clean-first
exit /b %errorlevel%
