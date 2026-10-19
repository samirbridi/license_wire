@echo off
call "%MIZIN_VCVARS%" >nul
if errorlevel 1 exit /b 1
cmake -S "%~1" -B "%~2" -G "NMake Makefiles" -DCMAKE_BUILD_TYPE=Release -DCMAKE_PREFIX_PATH="%~3"
if errorlevel 1 exit /b 1
rem Always rebuild headers on the localized MSVC/NMake toolchain.
rem Its include dependency scan can omit header changes and retain incompatible objects.
cmake --build "%~2" --config Release --clean-first
exit /b %errorlevel%
