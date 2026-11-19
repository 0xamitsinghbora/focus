!macro customInstall
  DetailPrint "Creating Start Menu shortcuts for Focus..."
  CreateDirectory "$SMPROGRAMS\Focus"
  CreateShortCut "$SMPROGRAMS\Focus\Focus.lnk" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"

  ${if} ${FileExists} "$INSTDIR\uninstallerIcon.ico"
    CreateShortCut "$SMPROGRAMS\Focus\Uninstall Focus.lnk" "$INSTDIR\Uninstall Focus.exe" "" "$INSTDIR\uninstallerIcon.ico" 0 "" "" "Uninstall Focus completely"
    CreateShortCut "$SMPROGRAMS\Uninstall Focus.lnk" "$INSTDIR\Uninstall Focus.exe" "" "$INSTDIR\uninstallerIcon.ico" 0 "" "" "Uninstall Focus completely"
  ${else}
    CreateShortCut "$SMPROGRAMS\Focus\Uninstall Focus.lnk" "$INSTDIR\Uninstall Focus.exe" "" "$appExe" 0 "" "" "Uninstall Focus completely"
    CreateShortCut "$SMPROGRAMS\Uninstall Focus.lnk" "$INSTDIR\Uninstall Focus.exe" "" "$appExe" 0 "" "" "Uninstall Focus completely"
  ${endif}

  DetailPrint "Configuring Windows Installed Apps registry entries..."
  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "DisplayName" "Focus"
  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "Publisher" "HealthOS"
  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegDWORD SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "NoModify" 1
  WriteRegDWORD SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "NoRepair" 1

  ${if} ${FileExists} "$INSTDIR\uninstallerIcon.ico"
    WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "DisplayIcon" "$INSTDIR\uninstallerIcon.ico"
  ${else}
    WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "DisplayIcon" "$appExe,0"
  ${endif}
!macroend

!macro customUnInstall
  DetailPrint "Stopping any running Focus processes..."
  nsExec::Exec 'taskkill /F /IM Focus.exe /T'
  Sleep 500

  DetailPrint "Removing Start Menu and Desktop shortcuts..."
  Delete "$SMPROGRAMS\Uninstall Focus.lnk"
  Delete "$SMPROGRAMS\Focus\Uninstall Focus.lnk"
  Delete "$SMPROGRAMS\Focus\Focus.lnk"
  RMDir /r "$SMPROGRAMS\Focus"
  Delete "$DESKTOP\Focus.lnk"

  DetailPrint "Cleaning up Windows autostart entries..."
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "focus"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.focus.app"
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "focus"
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "com.focus.app"

  DetailPrint "Cleaning up Focus temporary cache..."
  SetShellVarContext current
  RMDir /r "$LOCALAPPDATA\focus"
  RMDir /r "$LOCALAPPDATA\Focus"
  RMDir /r "$LOCALAPPDATA\focus-updater"
  RMDir /r "$LOCALAPPDATA\com.focus.app"

  IfSilent keepData
  MessageBox MB_YESNO|MB_ICONQUESTION "Do you want to completely delete your Focus database, activity logs, and settings?" IDNO keepData
  DetailPrint "Purging Focus user data, databases, and logs..."
  RMDir /r "$APPDATA\focus"
  RMDir /r "$APPDATA\Focus"
  RMDir /r "$APPDATA\com.focus.app"

keepData:

  ${if} $installMode == "all"
    SetShellVarContext all
  ${endif}

  DetailPrint "Cleaning up Focus registry keys..."
  DeleteRegKey HKCU "Software\focus"
  DeleteRegKey HKCU "Software\Focus"
  DeleteRegKey HKCU "Software\com.focus.app"
  DeleteRegKey HKLM "Software\focus"
  DeleteRegKey HKLM "Software\Focus"
  DeleteRegKey HKLM "Software\com.focus.app"
!macroend

