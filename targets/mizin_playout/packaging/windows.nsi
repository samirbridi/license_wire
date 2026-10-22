; Original per-user preview installer. No service, firewall, startup or codec changes.
Unicode true
RequestExecutionLevel user
SetCompressor /SOLID zlib
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "x64.nsh"
!include "WinVer.nsh"
!include "${GENERATED}"
Name "Mizin Playout (Preview)"
OutFile "${OUTPUT}"
InstallDir "$LOCALAPPDATA\Programs\Mizin Playout Preview"
InstallDirRegKey HKCU "Software\Mizin\PlayoutPreview" "InstallDir"
Icon "${APP_ICON}"
UninstallIcon "${APP_ICON}"
VIProductVersion "${APP_NUMERIC}"
VIAddVersionKey /LANG=1033 "ProductName" "Mizin Playout Preview Setup"
VIAddVersionKey /LANG=1033 "FileDescription" "Mizin Playout Preview Installer"
VIAddVersionKey /LANG=1033 "FileVersion" "${APP_VERSION}"
VIAddVersionKey /LANG=1033 "ProductVersion" "${APP_VERSION}"
VIAddVersionKey /LANG=1033 "LegalCopyright" "Mizin"
!define MUI_ICON "${APP_ICON}"
!define MUI_UNICON "${APP_ICON}"
!define MUI_ABORTWARNING
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"
!insertmacro MUI_LANGUAGE "PortugueseBR"
Var QaMode
Var PortableMode

Function .onInit
  SetShellVarContext current
  ; The Microsoft C/C++ runtime DLLs ship beside the app (app-local deployment), so Setup never needs
  ; the machine-wide runtime or administrator rights. A beta tester's Setup aborted here when the
  ; elevated runtime install was refused/failed while the portable ZIP ran fine on the same PC.
  ; prerequisites\vc_redist.x64.exe stays available for a manual machine-wide install.
  ${If} $PortableMode == 0
    WriteUninstaller "$INSTDIR\Uninstall.exe"
    WriteINIStr "$INSTDIR\installation.ini" "Setup" "QA" "$QaMode"
  ${EndIf}
  SetOutPath "$INSTDIR"
  ${If} $QaMode == 0
  ${AndIf} $PortableMode == 0
    CreateDirectory "$SMPROGRAMS\Mizin Playout Preview"
    CreateShortcut "$SMPROGRAMS\Mizin Playout Preview\Mizin Playout.lnk" "$INSTDIR\MizinPlayout.exe"
    CreateShortcut "$SMPROGRAMS\Mizin Playout Preview\Uninstall.lnk" "$INSTDIR\Uninstall.exe"
    WriteRegStr HKCU "Software\Mizin\PlayoutPreview" "InstallDir" "$INSTDIR"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\MizinPlayoutPreview" "DisplayName" "Mizin Playout (Preview)"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\MizinPlayoutPreview" "DisplayVersion" "${APP_VERSION}"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\MizinPlayoutPreview" "Publisher" "Mizin"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\MizinPlayoutPreview" "UninstallString" '"$INSTDIR\Uninstall.exe"'
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\MizinPlayoutPreview" "QuietUninstallString" '"$INSTDIR\Uninstall.exe" /S'
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\MizinPlayoutPreview" "DisplayIcon" "$INSTDIR\MizinPlayout.exe"
    WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\MizinPlayoutPreview" "NoModify" 1
    WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\MizinPlayoutPreview" "NoRepair" 1
  ${EndIf}
  Goto complete
complete:
SectionEnd

Section "Uninstall"
  SetShellVarContext current
  SetRegView 64
  ReadINIStr $QaMode "$INSTDIR\installation.ini" "Setup" "QA"
  ; Check the running EXE before removing any dependency or notice.
  ClearErrors
  Delete "$INSTDIR\MizinPlayout.exe"
  IfFileExists "$INSTDIR\MizinPlayout.exe" 0 removal_ready
    SetErrorLevel 1
    Abort "Close Mizin Playout before uninstalling."
removal_ready:
  !insertmacro UninstallPayload
  Delete "$INSTDIR\installation.ini"
  ${If} $QaMode == 0
    Delete "$SMPROGRAMS\Mizin Playout Preview\Mizin Playout.lnk"
    Delete "$SMPROGRAMS\Mizin Playout Preview\Uninstall.lnk"
    RMDir "$SMPROGRAMS\Mizin Playout Preview"
    ReadRegStr $0 HKCU "Software\Mizin\PlayoutPreview" "InstallDir"
    ${If} $0 == $INSTDIR
      DeleteRegKey HKCU "Software\Mizin\PlayoutPreview"
      DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\MizinPlayoutPreview"
    ${EndIf}
  ${EndIf}
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  ; Deliberately no recursive deletion: unknown files and all state/media survive.
SectionEnd
