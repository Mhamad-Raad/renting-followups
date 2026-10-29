; The uninstall screen says plainly that the rent data is kept (ARCHITECTURE.md, packaging).
!macro customUnWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Uninstall Rent Tracker"
  !define MUI_WELCOMEPAGE_TEXT "This removes the Rent Tracker program from this computer.$\r$\n$\r$\nYour rent data, settings and backups are NOT deleted. They stay in your Windows user folder (AppData\Roaming\Rent Tracker), and the app finds them again if you install it later.$\r$\n$\r$\nClick Next to continue."
  !insertmacro MUI_UNPAGE_WELCOME
!macroend
