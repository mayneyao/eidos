import { useState, type KeyboardEvent as ReactKeyboardEvent } from "react"
import { RotateCcw, X } from "lucide-react"

import {
  DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS,
  EIDOS_LITE_SHORTCUT_COMMANDS,
  eidosLiteShortcutLabel,
  isReservedEidosLiteShortcut,
  shortcutBindingForKeyboardEvent,
  type EidosLiteKeyboardShortcuts,
  type EidosLiteShortcutBinding,
  type EidosLiteShortcutCommand,
} from "../shared/keyboard-shortcuts"
import { useEidosLiteI18n } from "./i18n"

const SHORTCUT_GROUPS: Array<{
  label: string
  commands: EidosLiteShortcutCommand[]
}> = [
  {
    label: "File",
    commands: ["new-file", "quick-open"],
  },
  {
    label: "Workspace",
    commands: [
      "toggle-sidebar",
      "toggle-theme",
      "toggle-version",
      "toggle-sync",
    ],
  },
]

const COMMAND_LABELS: Record<EidosLiteShortcutCommand, string> = {
  "new-file": "New File",
  "quick-open": "Quick Open",
  "toggle-sidebar": "Toggle Space Explorer",
  "toggle-theme": "Toggle theme",
  "toggle-version": "Toggle version history",
  "toggle-sync": "Toggle Sync",
}

type ShortcutIssue =
  | { command: EidosLiteShortcutCommand; type: "modifier" }
  | { command: EidosLiteShortcutCommand; type: "reserved" }
  | {
      command: EidosLiteShortcutCommand
      conflict: EidosLiteShortcutCommand
      type: "conflict"
    }

interface KeyboardShortcutSettingsProps {
  shortcuts: EidosLiteKeyboardShortcuts
  macos: boolean
  onChange(shortcuts: EidosLiteKeyboardShortcuts): void
}

export function keyboardShortcutRowMode(
  binding: EidosLiteShortcutBinding,
  defaultBinding: EidosLiteShortcutBinding
): "remove" | "reset" {
  return binding === defaultBinding ? "remove" : "reset"
}

function isModifierKey(key: string): boolean {
  return ["Alt", "Control", "Meta", "Shift"].includes(key)
}

export function KeyboardShortcutSettings({
  shortcuts,
  macos,
  onChange,
}: KeyboardShortcutSettingsProps) {
  const { t } = useEidosLiteI18n()
  const [recording, setRecording] = useState<EidosLiteShortcutCommand | null>(
    null
  )
  const [issue, setIssue] = useState<ShortcutIssue | null>(null)

  const assign = (
    command: EidosLiteShortcutCommand,
    binding: string | null
  ) => {
    if (binding && isReservedEidosLiteShortcut(binding)) {
      setIssue({ command, type: "reserved" })
      return
    }
    const conflict = binding
      ? EIDOS_LITE_SHORTCUT_COMMANDS.find(
          (candidate) =>
            candidate !== command && shortcuts[candidate] === binding
        )
      : undefined
    if (conflict) {
      setIssue({ command, conflict, type: "conflict" })
      return
    }
    setIssue(null)
    setRecording(null)
    onChange({ ...shortcuts, [command]: binding })
  }

  const capture = (
    command: EidosLiteShortcutCommand,
    event: ReactKeyboardEvent<HTMLButtonElement>
  ) => {
    if (recording !== command) return
    event.preventDefault()
    event.stopPropagation()
    if (event.key === "Escape") {
      setIssue(null)
      setRecording(null)
      return
    }
    if (
      (event.key === "Backspace" || event.key === "Delete") &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey
    ) {
      assign(command, null)
      return
    }
    if (isModifierKey(event.key)) return
    const binding = shortcutBindingForKeyboardEvent(event.nativeEvent, macos)
    if (!binding) {
      setIssue({ command, type: "modifier" })
      return
    }
    assign(command, binding)
  }

  const issueCopy = (command: EidosLiteShortcutCommand): string | null => {
    if (issue?.command !== command) return null
    if (issue.type === "reserved") {
      return t("This shortcut is reserved by the application or system.")
    }
    if (issue.type === "modifier") {
      return t("Include Command, Control, or Alt in the shortcut.")
    }
    return t("Already used by {command}.", {
      command: t(COMMAND_LABELS[issue.conflict]),
    })
  }

  return (
    <>
      <div className="settings-shortcut-toolbar">
        <p>
          {t(
            "Select a shortcut, then press a new key combination. Press Escape to cancel or Backspace to clear it."
          )}
        </p>
        <button
          type="button"
          className="settings-button settings-button-quiet"
          disabled={EIDOS_LITE_SHORTCUT_COMMANDS.every(
            (command) =>
              shortcuts[command] ===
              DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS[command]
          )}
          onClick={() => {
            setIssue(null)
            setRecording(null)
            onChange({ ...DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS })
          }}
        >
          <RotateCcw /> {t("Restore all defaults")}
        </button>
      </div>

      {SHORTCUT_GROUPS.map((group) => (
        <section
          className="settings-shortcut-section"
          aria-labelledby={`settings-shortcuts-${group.label.toLowerCase()}`}
          key={group.label}
        >
          <h2 id={`settings-shortcuts-${group.label.toLowerCase()}`}>
            {t(group.label)}
          </h2>
          <div className="settings-group settings-shortcut-list">
            {group.commands.map((command) => {
              const binding = shortcuts[command]
              const defaultBinding =
                DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS[command]
              const rowMode = keyboardShortcutRowMode(binding, defaultBinding)
              const modified = rowMode === "reset"
              const commandIssue = issueCopy(command)
              return (
                <div
                  className="settings-shortcut-row"
                  data-modified={modified ? "true" : "false"}
                  key={command}
                >
                  <div className="settings-row-copy">
                    <div className="settings-shortcut-label">
                      <strong>{t(COMMAND_LABELS[command])}</strong>
                      {modified ? (
                        <span className="settings-shortcut-modified">
                          {t("Modified")}
                        </span>
                      ) : null}
                    </div>
                    {commandIssue ? (
                      <small className="settings-shortcut-issue" role="alert">
                        {commandIssue}
                      </small>
                    ) : null}
                  </div>
                  <div className="settings-shortcut-actions">
                    <button
                      type="button"
                      className="settings-shortcut-recorder"
                      data-recording={recording === command ? "true" : "false"}
                      aria-pressed={recording === command}
                      onClick={() => {
                        setIssue(null)
                        setRecording(command)
                      }}
                      onBlur={() => {
                        if (recording === command) setRecording(null)
                      }}
                      onKeyDown={(event) => capture(command, event)}
                    >
                      <kbd>
                        {recording === command
                          ? t("Press shortcut…")
                          : binding
                            ? eidosLiteShortcutLabel(binding, macos)
                            : t("Not set")}
                      </kbd>
                    </button>
                    {rowMode === "remove" ? (
                      <button
                        type="button"
                        className="settings-shortcut-action"
                        aria-label={t("Clear {command}", {
                          command: t(COMMAND_LABELS[command]),
                        })}
                        title={t("Clear shortcut")}
                        onClick={() => assign(command, null)}
                      >
                        <X />
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="settings-shortcut-action"
                        aria-label={t("Restore default for {command}", {
                          command: t(COMMAND_LABELS[command]),
                        })}
                        title={t("Restore default")}
                        onClick={() => assign(command, defaultBinding)}
                      >
                        <RotateCcw />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      ))}

      <p className="settings-section-note settings-shortcut-note">
        {t(
          "Custom shortcuts apply to workspace windows. Standard text editing shortcuts remain unchanged inside inputs and editors."
        )}
      </p>
    </>
  )
}
