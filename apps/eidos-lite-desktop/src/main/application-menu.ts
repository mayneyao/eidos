import type { MenuItemConstructorOptions } from "electron"

interface ApplicationMenuHandlers {
  openSettings(): void
  openDocumentation(): void
  openWebsite(): void
}

export function eidosLiteApplicationMenuTemplate(
  platform: NodeJS.Platform,
  appName: string,
  handlers: ApplicationMenuHandlers
): MenuItemConstructorOptions[] {
  const settings: MenuItemConstructorOptions = {
    label: "Settings…",
    accelerator: "CmdOrCtrl+,",
    click: handlers.openSettings,
  }
  return [
    ...(platform === "darwin"
      ? [
          {
            label: appName,
            submenu: [
              { role: "about" as const },
              { type: "separator" as const },
              settings,
              { type: "separator" as const },
              { role: "services" as const },
              { type: "separator" as const },
              { role: "hide" as const },
              { role: "hideOthers" as const },
              { role: "unhide" as const },
              { type: "separator" as const },
              { role: "quit" as const },
            ],
          },
        ]
      : []),
    {
      label: "File",
      submenu:
        platform === "darwin"
          ? [{ role: "close" }]
          : [settings, { type: "separator" }, { role: "quit" }],
    },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [
        { label: "Eidos Documentation", click: handlers.openDocumentation },
        { label: "Eidos Website", click: handlers.openWebsite },
        ...(platform === "darwin"
          ? []
          : [{ type: "separator" as const }, { role: "about" as const }]),
      ],
    },
  ]
}
