import type { MenuItemConstructorOptions } from "electron"

import { translateEidosLite, type EidosLiteLocale } from "../shared/i18n"
import type { EidosLiteClipboardCommand } from "../shared/contracts"

interface ApplicationMenuHandlers {
  openSettings(): void
  openDocumentation(): void
  openWebsite(): void
  clipboardCommand(command: EidosLiteClipboardCommand): void
}

export function eidosLiteApplicationMenuTemplate(
  platform: NodeJS.Platform,
  appName: string,
  handlers: ApplicationMenuHandlers,
  locale: EidosLiteLocale = "en"
): MenuItemConstructorOptions[] {
  const t = (message: string) => translateEidosLite(locale, message)
  const settings: MenuItemConstructorOptions = {
    label: t("Settings…"),
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
      label: t("File"),
      submenu:
        platform === "darwin"
          ? [{ role: "close" }]
          : [settings, { type: "separator" }, { role: "quit" }],
    },
    {
      label: t("Edit"),
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        ...(
          [
            { command: "cut", label: "Cut", accelerator: "CmdOrCtrl+X" },
            { command: "copy", label: "Copy", accelerator: "CmdOrCtrl+C" },
            { command: "paste", label: "Paste", accelerator: "CmdOrCtrl+V" },
          ] as const
        ).map(({ command, label, accelerator }) => ({
          id: `clipboard-${command}`,
          label: t(label),
          accelerator,
          click: () => handlers.clipboardCommand(command),
        })),
        ...(platform === "darwin"
          ? [{ role: "pasteAndMatchStyle" as const }]
          : []),
        { role: "delete" },
        { type: "separator" },
        { role: "selectAll" },
        ...(platform === "darwin"
          ? [
              { type: "separator" as const },
              { role: "startSpeaking" as const },
              { role: "stopSpeaking" as const },
            ]
          : []),
      ],
    },
    { role: "viewMenu", label: t("View") },
    { role: "windowMenu", label: t("Window") },
    {
      role: "help",
      label: t("Help"),
      submenu: [
        { label: t("Eidos Documentation"), click: handlers.openDocumentation },
        { label: t("Eidos Website"), click: handlers.openWebsite },
        ...(platform === "darwin"
          ? []
          : [{ type: "separator" as const }, { role: "about" as const }]),
      ],
    },
  ]
}
