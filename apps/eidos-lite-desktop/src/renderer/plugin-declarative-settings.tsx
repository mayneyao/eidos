import { useCallback, useEffect, useId, useRef, useState } from "react"
import type {
  PluginManifest,
  SettingDeclaration,
  SettingValue,
} from "@eidos.space/plugin-sdk"
import { validateSetting } from "@eidos.space/plugin-runtime/manifest"
import { useEidosLiteI18n } from "./i18n"

type FieldStatus = "idle" | "unsaved" | "saving" | "saved" | "error"

export function PluginDeclarativeSettings({
  manifest,
}: {
  manifest: PluginManifest
}) {
  const { t } = useEidosLiteI18n()
  const headingId = useId()
  const [loaded, setLoaded] = useState<{
    id: string
    values?: Record<string, SettingValue>
    error?: string
  } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [showLoading, setShowLoading] = useState(false)
  const [statuses, setStatuses] = useState<Record<string, FieldStatus>>({})
  useEffect(() => {
    let live = true
    setStatuses({})
    setShowLoading(false)
    const timer = window.setTimeout(() => {
      if (live) setShowLoading(true)
    }, 200)
    void window.eidosLite.pluginSettings(manifest.id).then(
      (values) => {
        window.clearTimeout(timer)
        if (live) setLoaded({ id: manifest.id, values })
      },
      (cause: unknown) => {
        window.clearTimeout(timer)
        if (live) setLoaded({ id: manifest.id, error: String(cause) })
      }
    )
    return () => {
      live = false
      window.clearTimeout(timer)
    }
  }, [manifest.id, attempt])
  const onStatus = useCallback((key: string, status: FieldStatus) => {
    setStatuses((current) => ({ ...current, [key]: status }))
  }, [])
  const state = loaded?.id === manifest.id ? loaded : null
  const fieldStatuses = state?.values ? Object.values(statuses) : []
  const status = fieldStatuses.includes("saving")
    ? t("Saving…")
    : fieldStatuses.includes("error")
      ? t("Save failed")
      : fieldStatuses.includes("unsaved")
        ? t("Unsaved changes")
        : fieldStatuses.includes("saved")
          ? t("Saved")
          : ""
  return (
    <section
      className="plugin-declarative-settings"
      aria-labelledby={headingId}
    >
      <header className="plugin-settings-heading">
        <div>
          <h2 id={headingId}>{t("Plugin settings")}</h2>
          <p>{t("Changes are saved automatically in this Space.")}</p>
        </div>
        <span className="plugin-settings-status" role="status">
          {status}
        </span>
      </header>
      {state?.values ? (
        <div className="settings-group plugin-settings-fields">
          {Object.entries(manifest.settings ?? {}).map(([key, declaration]) => (
            <PluginSettingField
              key={`${manifest.id}:${key}`}
              pluginId={manifest.id}
              settingKey={key}
              declaration={declaration}
              initialValue={state.values?.[key] ?? declaration.default}
              onStatus={onStatus}
            />
          ))}
        </div>
      ) : (
        <div
          className="plugin-settings-load"
          aria-busy={!state?.error}
          style={{
            minHeight: `${Math.max(1, Object.keys(manifest.settings ?? {}).length) * 3.5}rem`,
          }}
        >
          {state?.error ? (
            <>
              <p role="alert">
                {t("Could not load settings. {message}", {
                  message: state.error,
                })}
              </p>
              <button
                type="button"
                className="settings-button"
                onClick={() => {
                  setLoaded(null)
                  setAttempt((current) => current + 1)
                }}
              >
                {t("Retry")}
              </button>
            </>
          ) : showLoading ? (
            <p role="status">{t("Loading settings…")}</p>
          ) : null}
        </div>
      )}
    </section>
  )
}

function PluginSettingField({
  pluginId,
  settingKey,
  declaration,
  initialValue,
  onStatus,
}: {
  pluginId: string
  settingKey: string
  declaration: SettingDeclaration
  initialValue: SettingValue
  onStatus(key: string, status: FieldStatus): void
}) {
  const { t } = useEidosLiteI18n()
  const id = useId()
  const live = useRef(true)
  const inFlight = useRef(false)
  const [value, setValue] = useState(initialValue)
  const [draft, setDraft] = useState(String(initialValue))
  const [pending, setPending] = useState<SettingValue | null>(null)
  const [error, setError] = useState("")
  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])

  async function save(next: SettingValue) {
    if (inFlight.current) return
    if (next === value) {
      setError("")
      onStatus(settingKey, "idle")
      return
    }
    try {
      validateSetting(declaration, next)
    } catch {
      setError(t("This value is too long."))
      onStatus(settingKey, "error")
      return
    }
    inFlight.current = true
    setPending(next)
    setError("")
    onStatus(settingKey, "saving")
    try {
      await window.eidosLite.setPluginSetting(pluginId, settingKey, next)
      if (!live.current) return
      setValue(next)
      setDraft(String(next))
      onStatus(settingKey, "saved")
    } catch (cause) {
      if (!live.current) return
      setError(t("Could not save. {message}", { message: String(cause) }))
      onStatus(settingKey, "error")
    } finally {
      inFlight.current = false
      if (live.current) setPending(null)
    }
  }

  function commitDraft() {
    if (declaration.type !== "number") {
      void save(draft)
      return
    }
    const next = Number(draft)
    const message =
      !draft.trim() || !Number.isFinite(next)
        ? t("Enter a number.")
        : declaration.minimum !== undefined && next < declaration.minimum
          ? t("Enter {minimum} or more.", { minimum: declaration.minimum })
          : declaration.maximum !== undefined && next > declaration.maximum
            ? t("Enter {maximum} or less.", { maximum: declaration.maximum })
            : ""
    if (message) {
      setError(message)
      onStatus(settingKey, "error")
    } else void save(next)
  }

  const range =
    declaration.type !== "number"
      ? ""
      : declaration.minimum !== undefined && declaration.maximum !== undefined
        ? t("Range: {minimum}–{maximum}", {
            minimum: declaration.minimum,
            maximum: declaration.maximum,
          })
        : declaration.minimum !== undefined
          ? t("Minimum: {minimum}", { minimum: declaration.minimum })
          : declaration.maximum !== undefined
            ? t("Maximum: {maximum}", { maximum: declaration.maximum })
            : ""
  const describedBy =
    [
      declaration.description ? `${id}-description` : "",
      range ? `${id}-range` : "",
      error ? `${id}-error` : "",
    ]
      .filter(Boolean)
      .join(" ") || undefined
  return (
    <div
      className="plugin-setting-row"
      data-setting-type={declaration.type}
      aria-busy={pending !== null}
    >
      <div className="plugin-setting-copy">
        <label id={`${id}-label`} htmlFor={id}>
          {declaration.title}
        </label>
        {declaration.description && (
          <p id={`${id}-description`}>{declaration.description}</p>
        )}
        {range && <p id={`${id}-range`}>{range}</p>}
      </div>
      <div className="plugin-setting-control">
        {declaration.type === "boolean" ? (
          <button
            id={id}
            type="button"
            role="switch"
            className="settings-switch"
            aria-labelledby={`${id}-label`}
            aria-describedby={describedBy}
            aria-checked={(pending ?? value) === true}
            aria-disabled={pending !== null}
            onClick={() => void save(value !== true)}
          >
            <span aria-hidden="true" />
          </button>
        ) : declaration.type === "string" && declaration.enum ? (
          <select
            id={id}
            className="plugin-setting-input"
            aria-describedby={describedBy}
            aria-invalid={!!error}
            value={String(pending ?? value)}
            disabled={pending !== null}
            onChange={(event) => void save(event.target.value)}
          >
            {declaration.enum.map((choice) => (
              <option key={choice} value={choice}>
                {choice}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={id}
            className="plugin-setting-input"
            type={declaration.type === "number" ? "number" : "text"}
            value={draft}
            aria-describedby={describedBy}
            aria-invalid={!!error}
            readOnly={pending !== null}
            min={
              declaration.type === "number" ? declaration.minimum : undefined
            }
            max={
              declaration.type === "number" ? declaration.maximum : undefined
            }
            step={declaration.type === "number" ? "any" : undefined}
            onChange={(event) => {
              setDraft(event.target.value)
              setError("")
              onStatus(
                settingKey,
                event.target.value === String(value) ? "idle" : "unsaved"
              )
            }}
            onBlur={commitDraft}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing || inFlight.current) return
              if (event.key === "Enter") {
                event.preventDefault()
                event.currentTarget.blur()
              } else if (event.key === "Escape") {
                event.preventDefault()
                event.stopPropagation()
                setDraft(String(value))
                setError("")
                onStatus(settingKey, "idle")
              }
            }}
          />
        )}
      </div>
      {error && (
        <p id={`${id}-error`} className="plugin-setting-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
