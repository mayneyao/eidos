import { useCallback, useEffect, useRef, useState } from "react"
import type { SpaceFileEditorSettings as EditorSettings } from "../shared/plugins"
import { useEidosLiteI18n } from "./i18n"
import { SETTINGS, settingTarget } from "./settings-catalog"

export function SpaceFileEditorSettings({ active }: { active: boolean }) {
  const { t, locale } = useEidosLiteI18n()
  const [data, setData] = useState<EditorSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const refreshVersion = useRef(0)
  const contextVersion = useRef(0)
  const refresh = useCallback(async () => {
    const version = ++refreshVersion.current
    try {
      const next = await window.eidosLite.getSpaceFileEditorSettings()
      if (version === refreshVersion.current) setData(next)
    } catch (cause) {
      if (version === refreshVersion.current) {
        setData(null)
        setError(cause instanceof Error ? cause.message : String(cause))
      }
    } finally {
      if (version === refreshVersion.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!active) {
      contextVersion.current++
      setData(null)
      setError(null)
      setBusy(false)
      setLoading(true)
      return
    }
    if (!window.eidosLite.getSpaceFileEditorSettings) return
    void refresh()
    const unbind = window.eidosLite.onSettingsSpaceFileEditorsChanged?.(() => {
      contextVersion.current++
      setData(null)
      setError(null)
      setBusy(false)
      setLoading(true)
      void refresh()
    })
    const unsubscribe = window.eidosLite.onPluginEvent?.(({ event }) => {
      if (event.observation === "host.catalog") void refresh()
    })
    const deviceChanged = () => void refresh()
    window.addEventListener("eidos-plugins-changed", deviceChanged)
    return () => {
      refreshVersion.current++
      unbind?.()
      unsubscribe?.()
      window.removeEventListener("eidos-plugins-changed", deviceChanged)
    }
  }, [active, locale, refresh])

  async function setDefault(extension: string, value: string) {
    if (!data) return
    const version = contextVersion.current
    setBusy(true)
    setError(null)
    try {
      await window.eidosLite.setSpaceFileEditorDefault(
        data.contextId,
        extension,
        value || null
      )
      if (version === contextVersion.current) await refresh()
    } catch (cause) {
      if (version === contextVersion.current)
        setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      if (version === contextVersion.current) setBusy(false)
    }
  }

  return (
    <div
      className="settings-group"
      {...settingTarget(SETTINGS.spaceFileEditors.id)}
    >
      <div className="settings-row">
        <div className="settings-row-copy">
          <strong>
            {data
              ? t("Default editors in {space}", { space: data.spaceName })
              : t("Space file defaults")}
          </strong>
          {!data && !loading && !error && (
            <small>
              {t("Open Settings from a Space to manage its file defaults.")}
            </small>
          )}
          {data?.extensions.length === 0 && (
            <small>{t("No plugin editors are enabled in this Space.")}</small>
          )}
          {error && <small role="alert">{error}</small>}
        </div>
      </div>
      {data?.extensions.map(
        ({ extension, override, deviceEditor, editors }) => {
          const unavailable =
            override !== null &&
            override !== "builtin" &&
            !editors.some(({ key }) => key === override)
          return (
            <div key={extension} className="settings-row settings-row-stacked">
              <div className="settings-row-copy">
                <strong>{extension}</strong>
              </div>
              <select
                className="settings-shell-select"
                aria-label={t("Default editor for {extension} in {space}", {
                  extension,
                  space: data.spaceName,
                })}
                value={override ?? ""}
                disabled={busy}
                onChange={(event) =>
                  void setDefault(extension, event.currentTarget.value)
                }
              >
                <option value="">
                  {t("Use device default ({editor})", {
                    editor: deviceEditor ?? t("Built-in editor"),
                  })}
                </option>
                {(override === "builtin" || deviceEditor !== null) && (
                  <option value="builtin">{t("Built-in editor")}</option>
                )}
                {unavailable && (
                  <option value={override} disabled>
                    {t("Saved editor unavailable (using built-in editor)")}
                  </option>
                )}
                {editors.map(({ key, label }) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          )
        }
      )}
    </div>
  )
}
