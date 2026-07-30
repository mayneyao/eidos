import { useCallback, useEffect, useState } from "react"
import {
  Copy,
  ExternalLink,
  FolderOpen,
  Info,
  MonitorCog,
  RotateCcw,
  Settings2,
} from "lucide-react"

import type {
  EidosLiteAppearance,
  EidosLiteAppInfo,
  EidosLitePreferences,
  EidosLiteSettingsDestination,
} from "../shared/contracts"
import { DEFAULT_RENDERER_PREFERENCES } from "./app-appearance"

type SettingsSection = "general" | "about"

const APPEARANCE_OPTIONS: Array<{
  value: EidosLiteAppearance
  label: string
}> = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
]

function platformLabel(appInfo: EidosLiteAppInfo): string {
  const platform =
    appInfo.platform === "darwin"
      ? "macOS"
      : appInfo.platform === "win32"
        ? "Windows"
        : "Linux"
  const architecture =
    appInfo.architecture === "arm64"
      ? appInfo.platform === "darwin"
        ? "Apple silicon"
        : "ARM64"
      : appInfo.architecture === "x64"
        ? "64-bit"
        : appInfo.architecture
  return `${platform} · ${architecture}`
}

export function SettingsPage() {
  const [section, setSection] = useState<SettingsSection>("general")
  const [appInfo, setAppInfo] = useState<EidosLiteAppInfo | null>(null)
  const [preferences, setPreferences] = useState<EidosLitePreferences>(
    DEFAULT_RENDERER_PREFERENCES
  )
  const [busy, setBusy] = useState(false)
  const [diagnosticsCopied, setDiagnosticsCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const previousTitle = document.title
    document.title = "Settings — Eidos Lite"
    return () => {
      document.title = previousTitle
    }
  }, [])

  useEffect(() => {
    void window.eidosLite.getAppInfo().then(setAppInfo, (cause) => {
      setError(cause instanceof Error ? cause.message : String(cause))
    })
    void window.eidosLite.getPreferences().then(setPreferences, (cause) => {
      setError(cause instanceof Error ? cause.message : String(cause))
    })
    return window.eidosLite.onPreferencesChanged(setPreferences)
  }, [])

  const updatePreferences = useCallback(
    async (patch: Partial<EidosLitePreferences>) => {
      const previous = preferences
      setPreferences((current) => ({ ...current, ...patch }))
      setError(null)
      try {
        setPreferences(await window.eidosLite.updatePreferences(patch))
      } catch (cause) {
        setPreferences(previous)
        setError(cause instanceof Error ? cause.message : String(cause))
      }
    },
    [preferences]
  )

  const chooseSpaceLocation = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const next = await window.eidosLite.chooseDefaultSpaceLocation()
      if (next) setPreferences(next)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }, [])

  const openDestination = useCallback(
    async (destination: EidosLiteSettingsDestination) => {
      setError(null)
      try {
        await window.eidosLite.openSettingsDestination(destination)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause))
      }
    },
    []
  )

  const copyDiagnostics = useCallback(async () => {
    setError(null)
    try {
      await window.eidosLite.copyDiagnostics()
      setDiagnosticsCopied(true)
      window.setTimeout(() => setDiagnosticsCopied(false), 2_000)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [])

  return (
    <main
      className="settings-shell"
      data-platform={
        navigator.userAgent.includes("Macintosh") ? "darwin" : "other"
      }
      data-settings-ready={appInfo ? "true" : "false"}
    >
      <header className="settings-titlebar">
        <strong>Settings</strong>
      </header>
      <aside className="settings-sidebar" aria-label="Settings sections">
        <div className="settings-sidebar-brand">
          <span>Eidos Lite</span>
          <small>Preferences</small>
        </div>
        <nav>
          <button
            type="button"
            aria-current={section === "general" ? "page" : undefined}
            onClick={() => setSection("general")}
          >
            <Settings2 /> General
          </button>
          <button
            type="button"
            aria-current={section === "about" ? "page" : undefined}
            onClick={() => setSection("about")}
          >
            <Info /> About
          </button>
        </nav>
      </aside>
      <div className="settings-content">
        {section === "general" ? (
          <div className="settings-page" aria-labelledby="settings-general">
            <header className="settings-page-heading">
              <h1 id="settings-general">General</h1>
              <p>Preferences apply to every Eidos Lite window.</p>
            </header>

            <section aria-labelledby="settings-appearance">
              <h2 id="settings-appearance">Appearance</h2>
              <div className="settings-group">
                <div className="settings-row settings-row-stacked">
                  <div className="settings-row-copy">
                    <strong>Theme</strong>
                    <small>Follow the system or keep one appearance.</small>
                  </div>
                  <div
                    className="settings-segmented-control"
                    role="radiogroup"
                    aria-label="Theme"
                  >
                    {APPEARANCE_OPTIONS.map((option) => (
                      <button
                        type="button"
                        role="radio"
                        aria-checked={preferences.appearance === option.value}
                        key={option.value}
                        onClick={() =>
                          void updatePreferences({
                            appearance: option.value,
                          })
                        }
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section aria-labelledby="settings-spaces">
              <h2 id="settings-spaces">Spaces</h2>
              <div className="settings-group">
                <div className="settings-row settings-row-stacked">
                  <div className="settings-row-copy">
                    <strong>Default location for new Spaces</strong>
                    <small className="settings-path">
                      {preferences.defaultSpaceLocation ??
                        "Documents folder (system default)"}
                    </small>
                  </div>
                  <div className="settings-row-actions">
                    {preferences.defaultSpaceLocation ? (
                      <button
                        type="button"
                        className="settings-button settings-button-quiet"
                        onClick={() =>
                          void updatePreferences({
                            defaultSpaceLocation: null,
                          })
                        }
                      >
                        <RotateCcw /> Use default
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="settings-button"
                      disabled={busy}
                      onClick={() => void chooseSpaceLocation()}
                    >
                      <FolderOpen /> {busy ? "Choosing…" : "Choose…"}
                    </button>
                  </div>
                </div>
              </div>
              <p className="settings-section-note">
                Existing Spaces and their files are never moved.
              </p>
            </section>
          </div>
        ) : (
          <div className="settings-page" aria-labelledby="settings-about">
            <header className="settings-about-heading">
              <div className="settings-app-mark" aria-hidden="true">
                <MonitorCog />
              </div>
              <div>
                <h1 id="settings-about">Eidos Lite</h1>
                <p>Local-first work for Eidos Files.</p>
              </div>
            </header>

            <section aria-labelledby="settings-build">
              <h2 id="settings-build">Application</h2>
              <dl className="settings-group settings-facts">
                <div className="settings-row">
                  <dt>Version</dt>
                  <dd>{appInfo?.version ?? "—"}</dd>
                </div>
                <div className="settings-row">
                  <dt>Platform</dt>
                  <dd>{appInfo ? platformLabel(appInfo) : "—"}</dd>
                </div>
                <div className="settings-row">
                  <dt>Services</dt>
                  <dd className="settings-environment">
                    {appInfo?.services.name ?? "—"}
                  </dd>
                </div>
              </dl>
            </section>

            <section aria-labelledby="settings-resources">
              <h2 id="settings-resources">Resources</h2>
              <div className="settings-group settings-action-list">
                <button
                  type="button"
                  className="settings-row"
                  onClick={() => void openDestination("documentation")}
                >
                  <span>Documentation</span>
                  <ExternalLink />
                </button>
                <button
                  type="button"
                  className="settings-row"
                  onClick={() => void openDestination("website")}
                >
                  <span>Eidos website</span>
                  <ExternalLink />
                </button>
              </div>
            </section>

            <section aria-labelledby="settings-diagnostics">
              <h2 id="settings-diagnostics">Diagnostics</h2>
              <div className="settings-group settings-action-list">
                <button
                  type="button"
                  className="settings-row"
                  onClick={() => void copyDiagnostics()}
                >
                  <span>
                    {diagnosticsCopied
                      ? "Diagnostics copied"
                      : "Copy diagnostics"}
                  </span>
                  <Copy />
                </button>
                <button
                  type="button"
                  className="settings-row"
                  onClick={() => void openDestination("logs")}
                >
                  <span>Show logs folder</span>
                  <FolderOpen />
                </button>
              </div>
            </section>
          </div>
        )}
        {error ? (
          <p className="settings-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </main>
  )
}
