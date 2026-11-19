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
  const native = (
    role: NonNullable<MenuItemConstructorOptions["role"]>,
    message: string
  ): MenuItemConstructorOptions => ({
    role,
    ...(locale === "pt-BR" || locale === "ja" || locale === "ko"
      ? { label: translateEidosLite(locale, message, { name: appName }) }
      : {}),
  })
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
              native("about", "About {name}"),
              { type: "separator" as const },
              settings,
              { type: "separator" as const },
              { role: "services" as const },
              { type: "separator" as const },
              native("hide", "Hide {name}"),
              native("hideOthers", "Hide Others"),
              native("unhide", "Show All"),
              { type: "separator" as const },
              native("quit", "Quit {name}"),
            ],
          },
        ]
      : []),
    {
      label: t("File"),
      submenu:
        platform === "darwin"
          ? [native("close", "Close Window")]
          : [settings, { type: "separator" }, native("quit", "Quit {name}")],
    },
    {
      label: t("Edit"),
      submenu: [
        native("undo", "Undo"),
        native("redo", "Redo"),
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
          ? [native("pasteAndMatchStyle", "Paste and Match Style")]
          : []),
        native("delete", "Delete"),
        { type: "separator" },
        native("selectAll", "Select All"),
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
          : [{ type: "separator" as const }, native("about", "About {name}")]),
      ],
    },
  ]
}
