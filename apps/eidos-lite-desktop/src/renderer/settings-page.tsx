import { useCallback, useEffect, useState } from "react"
import {
  Cloud,
  Copy,
  ExternalLink,
  FolderOpen,
  LogIn,
  LogOut,
  MonitorCog,
  RotateCcw,
} from "lucide-react"

import type {
  EidosLiteAppearance,
  EidosLiteAppInfo,
  EidosLitePreferences,
  EidosLiteSettingsDestination,
} from "../shared/contracts"
import { DEFAULT_RENDERER_PREFERENCES } from "./app-appearance"
import {
  clearSyncStatusSnapshots,
  readSyncAccountContext,
  writeSyncStatusSnapshot,
} from "./sync-status-cache"

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
  const [appInfo, setAppInfo] = useState<EidosLiteAppInfo | null>(null)
  const [preferences, setPreferences] = useState<EidosLitePreferences>(
    DEFAULT_RENDERER_PREFERENCES
  )
  const [busy, setBusy] = useState(false)
  const [accountBusy, setAccountBusy] = useState<"sign-in" | "sign-out" | null>(
    null
  )
  const [syncAccount, setSyncAccount] = useState(() => readSyncAccountContext())
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

  const signIn = useCallback(async () => {
    setAccountBusy("sign-in")
    setError(null)
    try {
      const status = await window.eidosLite.beginSyncSignIn()
      const checkedAtMs = Date.now()
      writeSyncStatusSnapshot("settings", {
        version: 1,
        status,
        checkedAtMs,
      })
      setSyncAccount(readSyncAccountContext())
    } catch (cause) {
      console.error("Could not sign in to Sync from Settings", cause)
      setError(
        "Could not update your Sync account. Your local Spaces are unaffected."
      )
    } finally {
      setAccountBusy(null)
    }
  }, [])

  const signOut = useCallback(async () => {
    setAccountBusy("sign-out")
    setError(null)
    try {
      const status = await window.eidosLite.signOutSync()
      clearSyncStatusSnapshots()
      writeSyncStatusSnapshot("settings", {
        version: 1,
        status,
        checkedAtMs: Date.now(),
      })
      setSyncAccount(readSyncAccountContext())
    } catch (cause) {
      console.error("Could not sign out of Sync from Settings", cause)
      setError(
        "Could not update your Sync account. Your local Spaces are unaffected."
      )
    } finally {
      setAccountBusy(null)
    }
  }, [])

  const manageSyncAccount = useCallback(async () => {
    setError(null)
    try {
      await window.eidosLite.openSyncHelp("account")
    } catch (cause) {
      console.error("Could not open the Sync account page", cause)
      setError("Could not open your Sync account page. Try again later.")
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
      <div className="settings-content">
        <div className="settings-page">
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

          <section aria-labelledby="settings-account-sync">
            <h2 id="settings-account-sync">Account &amp; Sync</h2>
            <div className="settings-group">
              <div className="settings-row">
                <div className="settings-account-summary">
                  <span className="settings-account-avatar" aria-hidden="true">
                    {syncAccount?.account.user?.avatarDataUrl ||
                    syncAccount?.account.user?.avatarUrl ? (
                      <img
                        src={
                          syncAccount.account.user.avatarDataUrl ??
                          syncAccount.account.user.avatarUrl
                        }
                        alt=""
                      />
                    ) : (
                      <Cloud />
                    )}
                  </span>
                  <span className="settings-row-copy">
                    <strong>
                      {syncAccount?.account.state === "signed-in"
                        ? (syncAccount.account.user?.name ?? "Eidos Sync")
                        : "Eidos Sync"}
                    </strong>
                    <small>
                      {syncAccount?.account.state === "signed-in"
                        ? (syncAccount.account.user?.email ?? "Signed in")
                        : "Not signed in"}
                    </small>
                  </span>
                </div>
                {syncAccount?.account.state === "signed-in" ? (
                  <div className="settings-row-actions">
                    <button
                      type="button"
                      className="settings-button settings-button-quiet"
                      onClick={() => void manageSyncAccount()}
                    >
                      Manage account <ExternalLink />
                    </button>
                    <button
                      type="button"
                      className="settings-button"
                      disabled={accountBusy !== null}
                      onClick={() => void signOut()}
                    >
                      <LogOut />
                      {accountBusy === "sign-out" ? "Signing out…" : "Sign out"}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="settings-button"
                    disabled={accountBusy !== null}
                    onClick={() => void signIn()}
                  >
                    <LogIn />
                    {accountBusy === "sign-in" ? "Signing in…" : "Sign in"}
                  </button>
                )}
              </div>
            </div>
            <p className="settings-section-note">
              Your email and avatar are cached for a stable interface. Sign-in
              credentials remain in secure system storage.
            </p>
          </section>

          <section aria-labelledby="settings-spaces">
            <h2 id="settings-spaces">Spaces</h2>
            <div className="settings-group">
              <div className="settings-row">
                <div className="settings-row-copy">
                  <strong>Automatic versions</strong>
                  <small>
                    Save a new version after local activity settles. Off by
                    default so background versioning never interrupts long local
                    operations.
                  </small>
                </div>
                <button
                  type="button"
                  role="switch"
                  className="settings-switch"
                  aria-label="Automatic versions"
                  aria-checked={preferences.automaticCheckpoints}
                  onClick={() =>
                    void updatePreferences({
                      automaticCheckpoints: !preferences.automaticCheckpoints,
                    })
                  }
                >
                  <span />
                </button>
              </div>
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
              Manual saved versions remain available. Existing Spaces and their
              files are never moved.
            </p>
          </section>

          <section aria-labelledby="settings-about">
            <h2 id="settings-about">About</h2>
            <div className="settings-identity">
              <div className="settings-app-mark" aria-hidden="true">
                <MonitorCog />
              </div>
              <div className="settings-identity-copy">
                <strong>Eidos Lite</strong>
                <small>Local-first work for Eidos Files.</small>
                <small className="settings-identity-meta">
                  {appInfo
                    ? `${appInfo.version} · ${platformLabel(appInfo)} · `
                    : "…"}
                  {appInfo ? (
                    <span className="settings-environment">
                      {appInfo.services.name}
                    </span>
                  ) : null}
                </small>
              </div>
            </div>
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
        {error ? (
          <p className="settings-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </main>
  )
}
