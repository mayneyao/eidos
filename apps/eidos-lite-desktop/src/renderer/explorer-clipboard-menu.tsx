import { Copy, Scissors, ClipboardPaste } from "lucide-react"
import { eidosLiteShortcutLabel } from "../shared/keyboard-shortcuts"
import type { ExplorerClipboardCommand } from "./explorer-clipboard"
import { useEidosLiteI18n } from "./i18n"

export function ExplorerClipboardMenu({
  macos,
  canCapture,
  canPaste,
  onCommand,
  pasteOnly = false,
}: {
  macos: boolean
  canCapture: boolean
  canPaste: boolean
  pasteOnly?: boolean
  onCommand(command: ExplorerClipboardCommand): void
}) {
  const { t } = useEidosLiteI18n()
  return (
    <>
      {(
        [
          { command: "cut", label: "Cut", binding: "Mod+X", Icon: Scissors },
          { command: "copy", label: "Copy", binding: "Mod+C", Icon: Copy },
          {
            command: "paste",
            label: "Paste",
            binding: "Mod+V",
            Icon: ClipboardPaste,
          },
        ] as const
      )
        .filter((item) => !pasteOnly || item.command === "paste")
        .map(({ command, label, binding, Icon }) => (
          <button
            type="button"
            role="menuitem"
            key={command}
            disabled={command === "paste" ? !canPaste : !canCapture}
            onClick={() => onCommand(command)}
          >
            <Icon aria-hidden="true" /> {t(label)}
            <span className="space-context-menu-shortcut">
              {eidosLiteShortcutLabel(binding, macos)}
            </span>
          </button>
        ))}
    </>
  )
}
