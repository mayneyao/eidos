import { useEffect, useState } from "react"
import type {
  EidosLitePreferences,
  EidosLiteTerminalShell,
} from "../shared/contracts"
import { DEFAULT_RENDERER_PREFERENCES } from "./app-appearance"
import { useEidosLiteI18n } from "./i18n"

export function TerminalPluginDetails() {
  const { t } = useEidosLiteI18n()
  const [preferences, setPreferences] = useState(DEFAULT_RENDERER_PREFERENCES)
  const [shells, setShells] = useState<EidosLiteTerminalShell[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    void window.eidosLite
      .getPreferences()
      .then((value) => {
        if (active) setPreferences(value)
      })
      .catch((reason) => {
        if (active) setError(String(reason))
      })
    void window.eidosLite
      .listTerminalShells()
      .then((value) => {
        if (active) setShells(value)
      })
      .catch((reason) => {
        if (active) setError(String(reason))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    const unsubscribe = window.eidosLite.onPreferencesChanged(setPreferences)
    return () => {
      active = false
      unsubscribe()
    }
  }, [])
  const update = async (patch: Partial<EidosLitePreferences>) => {
    try {
      setPreferences(await window.eidosLite.updatePreferences(patch))
      setError(null)
    } catch (reason) {
      setError(String(reason))
    }
  }
  const enabled = preferences.builtInPlugins.terminal
  const systemShell = shells.find((shell) => shell.systemDefault)
  const unavailable =
    preferences.terminalShell !== null &&
    !shells.some((shell) => shell.executable === preferences.terminalShell)
  return (
    <div className="settings-group">
      <div className="settings-row" data-built-in-plugin="terminal">
        <div className="settings-row-copy">
          <strong>{t("Terminal")}</strong>
          <small>
            {t(
              "Built-in plugin for opening a shell in the current Space. It stays out of the workbench and loads only after you enable it."
            )}
          </small>
        </div>
        <button
          type="button"
          role="switch"
          className="settings-switch"
          aria-label={t("Terminal")}
          aria-checked={enabled}
          onClick={() =>
            void update({ builtInPlugins: { terminal: !enabled } })
          }
        >
          <span />
        </button>
      </div>
      <div className="settings-row settings-row-stacked" data-terminal-layout>
        <div className="settings-row-copy">
          <strong>{t("Terminal layout")}</strong>
          <small>
            {t(
              "Choose how Terminal and file content share the middle work area."
            )}
          </small>
        </div>
        <div
          className="settings-segmented-control"
          data-segment-count={2}
          role="radiogroup"
          aria-label={t("Terminal layout")}
        >
          {(
            [
              { value: "bottom", label: "Bottom" },
              { value: "side", label: "Beside file content" },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              data-terminal-layout={option.value}
              aria-checked={preferences.terminalLayout === option.value}
              disabled={!enabled}
              onClick={() => void update({ terminalLayout: option.value })}
            >
              {t(option.label)}
            </button>
          ))}
        </div>
      </div>
      <div className="settings-row settings-row-stacked" data-terminal-shell>
        <div className="settings-row-copy">
          <strong>{t("Default shell")}</strong>
          <small>
            {t(
              "Choose which installed shell new Terminal tabs use. Existing tabs are not restarted."
            )}
          </small>
        </div>
        <select
          className="settings-shell-select"
          aria-label={t("Default shell")}
          value={preferences.terminalShell ?? ""}
          disabled={loading || !enabled}
          onChange={(event) =>
            void update({ terminalShell: event.currentTarget.value || null })
          }
        >
          <option value="">
            {loading
              ? t("Detecting shells…")
              : systemShell
                ? t("System default — {shell}", { shell: systemShell.name })
                : t("System default")}
          </option>
          {unavailable && (
            <option value={preferences.terminalShell ?? ""}>
              {t("Unavailable — {shell}", {
                shell: preferences.terminalShell ?? "",
              })}
            </option>
          )}
          {shells.map((shell) => (
            <option key={shell.executable} value={shell.executable}>
              {shell.name} — {shell.executable}
            </option>
          ))}
        </select>
      </div>
      {error && <p role="alert">{error}</p>}
    </div>
  )
}
