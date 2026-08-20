import { useCallback, useEffect, useState } from "react"
import {
  Cloud,
  Copy,
  ExternalLink,
  FolderOpen,
  Info,
  Keyboard,
  LogIn,
  LogOut,
  MonitorCog,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react"

import type {
  EidosLiteAppearance,
  EidosLiteAppInfo,
  EidosLiteLanguage,
  EidosLitePreferences,
  EidosLiteSettingsDestination,
  EidosLiteUpdateStatus,
} from "../shared/contracts"
import { DEFAULT_RENDERER_PREFERENCES } from "./app-appearance"
import { useEidosLiteI18n } from "./i18n"
import { KeyboardShortcutSettings } from "./keyboard-shortcut-settings"
import { rendererPlatform } from "./renderer-platform"
import {
  clearSyncStatusSnapshots,
  readSyncAccountContext,
  writeSyncStatusSnapshot,
} from "./sync-status-cache"

const APPEARANCE_OPTIONS: Array<{
  value: EidosLiteAppearance
}> = [{ value: "system" }, { value: "light" }, { value: "dark" }]

const LANGUAGE_OPTIONS: Array<{
  value: EidosLiteLanguage
}> = [{ value: "system" }, { value: "en" }, { value: "zh" }]

const SETTINGS_PAGES = [
  { id: "preferences", label: "Preferences", icon: SlidersHorizontal },
  { id: "account-sync", label: "Account & Sync", icon: Cloud },
  { id: "spaces", label: "Spaces", icon: FolderOpen },
  { id: "shortcuts", label: "Keyboard Shortcuts", icon: Keyboard },
  { id: "updates", label: "Updates", icon: RefreshCw },
  { id: "about", label: "About", icon: Info },
] as const

type SettingsPageId = (typeof SETTINGS_PAGES)[number]["id"]

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
  const { t } = useEidosLiteI18n()
  const [activePage, setActivePage] = useState<SettingsPageId>("preferences")
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
  const [updateStatus, setUpdateStatus] =
    useState<EidosLiteUpdateStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const previousTitle = document.title
    document.title = `${t("Settings")} — Eidos Lite`
    return () => {
      document.title = previousTitle
    }
  }, [t])

  useEffect(() => {
    void window.eidosLite.getAppInfo().then(setAppInfo, (cause) => {
      setError(cause instanceof Error ? cause.message : String(cause))
    })
    void window.eidosLite.getPreferences().then(setPreferences, (cause) => {
      setError(cause instanceof Error ? cause.message : String(cause))
    })
    return window.eidosLite.onPreferencesChanged(setPreferences)
  }, [])

  useEffect(() => {
    void window.eidosLite.getUpdateStatus().then(setUpdateStatus)
    return window.eidosLite.onUpdateStatusChanged(setUpdateStatus)
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

  const checkForUpdates = useCallback(async () => {
    setError(null)
    try {
      setUpdateStatus(await window.eidosLite.checkForUpdates())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [])

  const downloadUpdate = useCallback(async () => {
    setError(null)
    try {
      setUpdateStatus(await window.eidosLite.downloadUpdate())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [])

  const updateCopy = (() => {
    if (!updateStatus) return "…"
    if (updateStatus.state === "unavailable") {
      return t("Updates are available only in a packaged production build.")
    }
    if (updateStatus.state === "checking") return t("Checking for updates…")
    if (updateStatus.state === "up-to-date") return t("You're up to date.")
    if (updateStatus.state === "available") {
      return t("Update {version} is available.", {
        version: updateStatus.version ?? "",
      })
    }
    if (updateStatus.state === "downloading") {
      return t("Downloading update… {percent}%", {
        percent: Math.round(updateStatus.progressPercent ?? 0),
      })
    }
    if (updateStatus.state === "downloaded") {
      return t("Version {version} is ready to install.", {
        version: updateStatus.version ?? "",
      })
    }
    if (updateStatus.state === "error") {
      return t("Could not check for updates. Try again later.")
    }
    return t("Current version: {version}", {
      version: updateStatus.currentVersion,
    })
  })()

  return (
    <main
      className="settings-shell"
      data-platform={appInfo?.platform ?? rendererPlatform()}
      data-settings-ready={appInfo ? "true" : "false"}
    >
      <header className="settings-titlebar">
        <strong>{t("Settings")}</strong>
      </header>
      <div className="settings-layout">
        <aside className="settings-sidebar">
          <nav aria-label={t("Settings sections")}>
            {SETTINGS_PAGES.map((page) => {
              const Icon = page.icon
              return (
                <button
                  type="button"
                  key={page.id}
                  aria-current={activePage === page.id ? "page" : undefined}
                  onClick={() => {
                    setError(null)
                    setActivePage(page.id)
                  }}
                >
                  <Icon aria-hidden="true" />
                  <span>{t(page.label)}</span>
                </button>
              )
            })}
          </nav>
        </aside>
        <div className="settings-content">
          <div className="settings-page" data-settings-page={activePage}>
            <section
              aria-labelledby="settings-preferences"
              hidden={activePage !== "preferences"}
            >
              <h2 id="settings-preferences">{t("Preferences")}</h2>
              <div className="settings-group">
                <div className="settings-row settings-row-stacked">
                  <div className="settings-row-copy">
                    <strong>{t("Theme")}</strong>
                    <small>
                      {t("Follow the system or keep one appearance.")}
                    </small>
                  </div>
                  <div
                    className="settings-segmented-control"
                    role="radiogroup"
                    aria-label={t("Theme")}
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
                        {t(
                          option.value === "system"
                            ? "System"
                            : option.value === "light"
                              ? "Light"
                              : "Dark"
                        )}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="settings-row settings-row-stacked">
                  <div className="settings-row-copy">
                    <strong>{t("Language")}</strong>
                    <small>
                      {t(
                        "Use the system language or choose one for Eidos Lite."
                      )}
                    </small>
                  </div>
                  <div
                    className="settings-segmented-control"
                    role="radiogroup"
                    aria-label={t("Language")}
                  >
                    {LANGUAGE_OPTIONS.map((option) => (
                      <button
                        type="button"
                        role="radio"
                        aria-checked={preferences.language === option.value}
                        key={option.value}
                        onClick={() =>
                          void updatePreferences({ language: option.value })
                        }
                      >
                        {t(
                          option.value === "system"
                            ? "System"
                            : option.value === "en"
                              ? "English"
                              : "Chinese"
                        )}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="settings-row">
                  <div className="settings-row-copy">
                    <strong>{t("Start week on Monday")}</strong>
                    <small>
                      {t("Show Monday as the first day in Calendar views.")}
                    </small>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    className="settings-switch"
                    aria-label={t("Start week on Monday")}
                    aria-checked={preferences.weekStartsOnMonday}
                    onClick={() =>
                      void updatePreferences({
                        weekStartsOnMonday: !preferences.weekStartsOnMonday,
                      })
                    }
                  >
                    <span />
                  </button>
                </div>
              </div>
            </section>

            <section
              aria-labelledby="settings-account-sync"
              hidden={activePage !== "account-sync"}
            >
              <h2 id="settings-account-sync">{t("Account & Sync")}</h2>
              <div className="settings-group">
                <div className="settings-row">
                  <div className="settings-account-summary">
                    <span
                      className="settings-account-avatar"
                      aria-hidden="true"
                    >
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
                          ? (syncAccount.account.user?.email ?? t("Signed in"))
                          : t("Not signed in")}
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
                        {t("Manage account")} <ExternalLink />
                      </button>
                      <button
                        type="button"
                        className="settings-button"
                        disabled={accountBusy !== null}
                        onClick={() => void signOut()}
                      >
                        <LogOut />
                        {accountBusy === "sign-out"
                          ? t("Signing out…")
                          : t("Sign out")}
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
                      {accountBusy === "sign-in"
                        ? t("Signing in…")
                        : t("Sign in")}
                    </button>
                  )}
                </div>
              </div>
              <p className="settings-section-note">
                {t(
                  "Your email and avatar are cached for a stable interface. Sign-in credentials remain in secure system storage."
                )}
              </p>
            </section>

            <section
              aria-labelledby="settings-spaces"
              hidden={activePage !== "spaces"}
            >
              <h2 id="settings-spaces">{t("Spaces")}</h2>
              <div className="settings-group">
                <div className="settings-row">
                  <div className="settings-row-copy">
                    <strong>{t("Automatic versions")}</strong>
                    <small>
                      {t(
                        "Save a new version after local activity settles. Off by default so background versioning never interrupts long local operations."
                      )}
                    </small>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    className="settings-switch"
                    aria-label={t("Automatic versions")}
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
                    <strong>{t("Default location for new Spaces")}</strong>
                    <small className="settings-path">
                      {preferences.defaultSpaceLocation ??
                        t("Documents folder (system default)")}
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
                        <RotateCcw /> {t("Use default")}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="settings-button"
                      disabled={busy}
                      onClick={() => void chooseSpaceLocation()}
                    >
                      <FolderOpen /> {busy ? t("Choosing…") : t("Choose…")}
                    </button>
                  </div>
                </div>
              </div>
              <p className="settings-section-note">
                {t(
                  "Manual saved versions remain available. Existing Spaces and their files are never moved."
                )}
              </p>
            </section>

            <section
              aria-labelledby="settings-shortcuts"
              hidden={activePage !== "shortcuts"}
            >
              <h2 id="settings-shortcuts">{t("Keyboard Shortcuts")}</h2>
              <KeyboardShortcutSettings
                shortcuts={preferences.keyboardShortcuts}
                macos={navigator.userAgent.includes("Macintosh")}
                onChange={(keyboardShortcuts) =>
                  void updatePreferences({ keyboardShortcuts })
                }
              />
            </section>

            <section
              aria-labelledby="settings-updates"
              hidden={activePage !== "updates"}
            >
              <h2 id="settings-updates">{t("Updates")}</h2>
              <div className="settings-group">
                <div className="settings-row">
                  <div className="settings-row-copy">
                    <strong>{t("Automatically download updates")}</strong>
                    <small>
                      {t(
                        "Check in the background and download signed updates when available."
                      )}
                    </small>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    className="settings-switch"
                    aria-label={t("Automatically download updates")}
                    aria-checked={preferences.automaticUpdates}
                    onClick={() =>
                      void updatePreferences({
                        automaticUpdates: !preferences.automaticUpdates,
                      })
                    }
                  >
                    <span />
                  </button>
                </div>
                <div className="settings-row">
                  <span className="settings-row-copy">
                    <strong>{t("Software update")}</strong>
                    <small>{updateCopy}</small>
                  </span>
                  {updateStatus?.state === "downloaded" ? (
                    <button
                      type="button"
                      className="settings-button"
                      onClick={() =>
                        void window.eidosLite.restartToInstallUpdate()
                      }
                    >
                      {t("Restart to update")}
                    </button>
                  ) : updateStatus?.state === "available" ? (
                    <button
                      type="button"
                      className="settings-button"
                      onClick={() => void downloadUpdate()}
                    >
                      {t("Download update")}
                    </button>
                  ) : updateStatus?.state !== "unavailable" ? (
                    <button
                      type="button"
                      className="settings-button"
                      disabled={
                        updateStatus?.state === "checking" ||
                        updateStatus?.state === "downloading"
                      }
                      onClick={() => void checkForUpdates()}
                    >
                      {t("Check for updates")}
                    </button>
                  ) : null}
                </div>
              </div>
            </section>

            <section
              aria-labelledby="settings-about"
              hidden={activePage !== "about"}
            >
              <h2 id="settings-about">{t("About")}</h2>
              <div className="settings-identity">
                <div className="settings-app-mark" aria-hidden="true">
                  <MonitorCog />
                </div>
                <div className="settings-identity-copy">
                  <strong>Eidos Lite</strong>
                  <small>{t("Local-first work for Eidos Files.")}</small>
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
                  <span>{t("Documentation")}</span>
                  <ExternalLink />
                </button>
                <button
                  type="button"
                  className="settings-row"
                  onClick={() => void openDestination("website")}
                >
                  <span>{t("Eidos website")}</span>
                  <ExternalLink />
                </button>
                <button
                  type="button"
                  className="settings-row"
                  onClick={() => void copyDiagnostics()}
                >
                  <span>
                    {diagnosticsCopied
                      ? t("Diagnostics copied")
                      : t("Copy diagnostics")}
                  </span>
                  <Copy />
                </button>
                <button
                  type="button"
                  className="settings-row"
                  onClick={() => void openDestination("logs")}
                >
                  <span>{t("Show logs folder")}</span>
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
      </div>
    </main>
  )
}
