@echo off
call "%MIZIN_VCVARS%" >nul
if errorlevel 1 exit /b 1
cmake -S "%~1" -B "%~2" -G "NMake Makefiles" -DCMAKE_BUILD_TYPE=Release -DCMAKE_PREFIX_PATH="%~3"
if errorlevel 1 exit /b 1
cmake --build "%~2" --config Release
exit /b %errorlevel%
