import { useCallback, useEffect, useMemo, useState } from "react"
import type { PluginListing } from "../shared/plugins"
import { PluginManager } from "./plugin-manager"
import {
  Blocks,
  Cloud,
  Copy,
  ExternalLink,
  FolderOpen,
  FileText,
  Info,
  Keyboard,
  LogIn,
  LogOut,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  Upload,
} from "lucide-react"
import appLogo from "../../assets/logo.svg"

import type {
  EidosLiteAppearance,
  EidosLiteAppInfo,
  EidosLiteLanguage,
  EidosLiteMarkdownEditingMode,
  EidosLitePreferences,
  EidosLiteSettingsDestination,
  EidosLiteTerminalLayout,
  EidosLiteTerminalShell,
  EidosLiteUpdateStatus,
  EidosSyncStatus,
} from "../shared/contracts"
import { DEFAULT_RENDERER_PREFERENCES } from "./app-appearance"
import { useEidosLiteI18n } from "./i18n"
import { KeyboardShortcutSettings } from "./keyboard-shortcut-settings"
import { usePublishAccount } from "./publish-account"
import { rendererPlatform } from "./renderer-platform"
import {
  clearSyncStatusSnapshots,
  readSyncAccountContext,
  writeSyncStatusSnapshot,
} from "./sync-status-cache"
import { TimeZonePicker } from "./time-zone-picker"
import { UsageMeter, formatUsageBytes } from "./usage-meter"

const APPEARANCE_OPTIONS: Array<{
  value: EidosLiteAppearance
}> = [{ value: "system" }, { value: "light" }, { value: "dark" }]

const LANGUAGE_OPTIONS: Array<{
  value: EidosLiteLanguage
}> = [{ value: "system" }, { value: "en" }, { value: "zh" }]

const MARKDOWN_EDITOR_OPTIONS: Array<{
  label: string
  value: EidosLiteMarkdownEditingMode
}> = [
  { label: "Source", value: "source" },
  { label: "Rich text", value: "wysiwyg" },
]

const TERMINAL_LAYOUT_OPTIONS: Array<{
  label: string
  value: EidosLiteTerminalLayout
}> = [
  { label: "Bottom", value: "bottom" },
  { label: "Beside file content", value: "side" },
]

const SETTINGS_PAGES = [
  { id: "preferences", label: "Preferences", icon: SlidersHorizontal },
  { id: "account-sync", label: "Account & Services", icon: Cloud },
  { id: "files", label: "Files", icon: FileText },
  { id: "plugins", label: "Plugins", icon: Blocks },
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
  const readPage = (): SettingsPageId => {
    const section = window.location.hash.split("/")[2]
    return (
      SETTINGS_PAGES.find((page) => page.id === section)?.id ?? "preferences"
    )
  }
  const [activePage, setActivePage] = useState<SettingsPageId>(readPage)
  useEffect(() => {
    window.history.replaceState(
      window.history.state,
      "",
      `#/settings/${readPage()}`
    )
    const restore = () => setActivePage(readPage())
    window.addEventListener("popstate", restore)
    window.addEventListener("hashchange", restore)
    return () => {
      window.removeEventListener("popstate", restore)
      window.removeEventListener("hashchange", restore)
    }
  }, [])
  const [appInfo, setAppInfo] = useState<EidosLiteAppInfo | null>(null)
  const [preferences, setPreferences] = useState<EidosLitePreferences>(
    DEFAULT_RENDERER_PREFERENCES
  )
  const [terminalShells, setTerminalShells] = useState<
    EidosLiteTerminalShell[]
  >([])
  const [terminalShellsLoading, setTerminalShellsLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [accountBusy, setAccountBusy] = useState<"sign-in" | "sign-out" | null>(
    null
  )
  const [syncAccount, setSyncAccount] = useState(() => readSyncAccountContext())
  const [syncStatus, setSyncStatus] = useState<EidosSyncStatus | null>(null)
  const [syncStatusBusy, setSyncStatusBusy] = useState(false)
  const publishAccountEnabled = syncAccount?.account.state === "signed-in"
  const {
    account: publishAccount,
    failed: publishAccountFailed,
    refreshing: publishAccountRefreshing,
    refresh: refreshPublishAccount,
  } = usePublishAccount({ enabled: publishAccountEnabled })
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
    let cancelled = false
    void window.eidosLite
      .listTerminalShells()
      .then(
        (shells) => {
          if (!cancelled) setTerminalShells(shells)
        },
        (cause) => {
          if (!cancelled) {
            setError(cause instanceof Error ? cause.message : String(cause))
          }
        }
      )
      .finally(() => {
        if (!cancelled) setTerminalShellsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    void window.eidosLite.getUpdateStatus().then(setUpdateStatus)
    return window.eidosLite.onUpdateStatusChanged(setUpdateStatus)
  }, [])

  const [pluginListing, setPluginListing] = useState<PluginListing | null>(null)

  useEffect(() => {
    if (activePage !== "files" || !window.eidosLite?.listPlugins) return
    let active = true
    const refresh = () => {
      void window.eidosLite
        .listPlugins()
        .then((listing) => {
          if (active) setPluginListing(listing)
        })
        .catch(() => {})
    }
    refresh()
    const unsubscribe = window.eidosLite.onPluginEvent?.(({ event }) => {
      if (event.observation === "host.catalog") refresh()
    })
    window.addEventListener("eidos-plugins-changed", refresh)
    return () => {
      active = false
      unsubscribe?.()
      window.removeEventListener("eidos-plugins-changed", refresh)
    }
  }, [activePage])

  const { markdownPluginEditors, htmlPluginEditors, fileEditorGroups } =
    useMemo(() => {
      const associations =
        pluginListing?.associations ?? pluginListing?.space?.associations ?? {}

      const extChoicesMap = new Map<string, { key: string; label: string }[]>()

      for (const plugin of pluginListing?.plugins ?? []) {
        for (const placement of plugin.manifest.placements ?? []) {
          if (
            placement.location !== "file/open" ||
            !placement.extensions?.length
          )
            continue
          const view = plugin.manifest.views?.find(
            (v) => v.id === placement.view && v.context === "document"
          )
          if (!view) continue
          const editorKey = `${plugin.manifest.id}/${view.id}`
          const editorLabel =
            plugin.manifest.name === view.title
              ? view.title
              : `${view.title} (${plugin.manifest.name})`

          for (const rawExt of placement.extensions) {
            const ext = (
              rawExt.startsWith(".") ? rawExt : `.${rawExt}`
            ).toLowerCase()
            if (ext === ".eidos") continue
            if (!extChoicesMap.has(ext)) {
              extChoicesMap.set(ext, [])
            }
            const list = extChoicesMap.get(ext)!
            if (!list.some((item) => item.key === editorKey)) {
              list.push({ key: editorKey, label: editorLabel })
            }
          }
        }
      }

      const mdChoices = [
        ...(extChoicesMap.get(".md") ?? []),
        ...(extChoicesMap.get(".markdown") ?? []),
      ].filter(
        (item, index, self) =>
          self.findIndex((other) => other.key === item.key) === index
      )

      const htmlChoices = [
        ...(extChoicesMap.get(".html") ?? []),
        ...(extChoicesMap.get(".htm") ?? []),
      ].filter(
        (item, index, self) =>
          self.findIndex((other) => other.key === item.key) === index
      )

      const nonBuiltinExts = [...extChoicesMap.keys()]
        .filter(
          (ext) =>
            ext !== ".md" &&
            ext !== ".markdown" &&
            ext !== ".html" &&
            ext !== ".htm"
        )
        .sort()

      const groups: {
        extensions: string[]
        label: string
        options: { key: string; label: string }[]
        selected: string
      }[] = []

      for (const ext of nonBuiltinExts) {
        const choices = extChoicesMap.get(ext)!
        const selected = associations[ext] ?? "builtin"
        const options = [
          { key: "builtin", label: t("Built-in editor") },
          ...choices,
        ]

        const existing = groups.find(
          (g) =>
            g.selected === selected &&
            g.options.length === options.length &&
            g.options.every((opt, idx) => opt.key === options[idx].key)
        )
        if (existing) {
          existing.extensions.push(ext)
          existing.label = existing.extensions.join(", ")
        } else {
          groups.push({
            extensions: [ext],
            label: ext,
            options,
            selected,
          })
        }
      }

      return {
        markdownPluginEditors: mdChoices,
        htmlPluginEditors: htmlChoices,
        fileEditorGroups: groups,
      }
    }, [pluginListing, t])

  const currentAssociations =
    pluginListing?.associations ?? pluginListing?.space?.associations ?? {}

  const activeMarkdownPlugin = markdownPluginEditors.find(
    (p) =>
      p.key === currentAssociations[".md"] ||
      p.key === currentAssociations[".markdown"]
  )
  const selectedMarkdownEditor =
    activeMarkdownPlugin?.key ?? preferences.markdownFileEditingMode

  const activeHtmlPlugin = htmlPluginEditors.find(
    (p) =>
      p.key === currentAssociations[".html"] ||
      p.key === currentAssociations[".htm"]
  )
  const selectedHtmlEditor =
    activeHtmlPlugin?.key ?? preferences.htmlFileOpenMode

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
      console.error(
        "Could not sign in to the Eidos account from Settings",
        cause
      )
      setError(
        t(
          "Could not update your Eidos account. Your local Spaces are unaffected."
        )
      )
    } finally {
      setAccountBusy(null)
    }
  }, [t])

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
      console.error(
        "Could not sign out of the Eidos account from Settings",
        cause
      )
      setError(
        t(
          "Could not update your Eidos account. Your local Spaces are unaffected."
        )
      )
    } finally {
      setAccountBusy(null)
    }
  }, [t])

  const manageSyncAccount = useCallback(async () => {
    setError(null)
    try {
      await window.eidosLite.openSyncHelp("account")
    } catch (cause) {
      console.error("Could not open the Eidos account page", cause)
      setError(t("Could not open your Eidos account page. Try again later."))
    }
  }, [t])

  const manageSyncAccess = useCallback(async () => {
    setError(null)
    try {
      await window.eidosLite.openSyncHelp("sync-access")
    } catch (cause) {
      console.error("Could not open the Sync access page", cause)
      setError(t("Could not open your Eidos account page. Try again later."))
    }
  }, [t])

  const syncSignedIn = syncAccount?.account.state === "signed-in"
  const refreshSyncStatus = useCallback(async () => {
    if (!syncSignedIn) return
    setSyncStatusBusy(true)
    try {
      const status = await window.eidosLite.getSyncStatus()
      const checkedAtMs = Date.now()
      setSyncStatus(status)
      writeSyncStatusSnapshot("settings", {
        version: 1,
        status,
        checkedAtMs,
      })
      setSyncAccount(readSyncAccountContext())
    } catch (cause) {
      console.error("Could not refresh the Sync status", cause)
    } finally {
      setSyncStatusBusy(false)
    }
  }, [syncSignedIn])

  useEffect(() => {
    if (!syncSignedIn) {
      setSyncStatus(null)
      return
    }
    void refreshSyncStatus()
  }, [syncSignedIn, refreshSyncStatus])

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
  const systemTerminalShell = terminalShells.find(
    (shell) => shell.systemDefault
  )
  const selectedTerminalShellUnavailable =
    preferences.terminalShell !== null &&
    !terminalShells.some(
      (shell) => shell.executable === preferences.terminalShell
    )
  const syncAccessLabel = !syncAccount
    ? null
    : syncAccount.account.state !== "signed-in"
      ? t("Sign-in required")
      : syncAccount.entitlement.state === "read-write"
        ? t("Download and upload")
        : syncAccount.entitlement.state === "read-only"
          ? t("Download only")
          : syncAccount.entitlement.state === "blocked"
            ? t("Blocked")
            : t("Sync access required")
  const syncDeviceLabel = syncAccount
    ? `${syncAccount.device.state === "active" ? t("Registered") : t("Not registered")} · ${
        syncAccount.environment === "staging" ? t("Staging") : t("Production")
      }`
    : null
  const syncEntitlement =
    syncStatus?.entitlement ?? syncAccount?.entitlement ?? null
  const syncQuotaBytes = syncEntitlement?.quotaBytes
  const syncUsedBytes = syncEntitlement?.usedBytes
  const syncReservedBytes = syncEntitlement?.reservedBytes ?? 0
  const publishUsedBytes =
    publishAccount?.usedStorageBytes !== null &&
    publishAccount?.usedStorageBytes !== undefined
      ? Number(publishAccount.usedStorageBytes)
      : null
  const publishQuotaBytes = publishAccount
    ? Number(publishAccount.maxStorageBytes)
    : null
  const publishPlanTitle = publishAccount
    ? publishAccount.plan === "free"
      ? t("Publish Free")
      : t("Publish Pro")
    : t("Publish")
  const publishPlanSummary = publishAccount
    ? publishAccount.plan === "free"
      ? t("10 public Markdown pages · 100 MiB shared storage")
      : t("Eidos Files, Markdown, and Forms")
    : publishAccountFailed
      ? t("Publish plan could not be checked. Check your connection and retry.")
      : t("Checking Publish plan…")
  const publishRestriction =
    publishAccount && publishAccount.state !== "active"
      ? t("Open your account to verify your email or restore Publish access.")
      : publishAccount?.plan === "free" &&
          publishAccount.activeSlugs !== null &&
          publishAccount.activeSlugs.length >= 10
        ? t(
            "All 10 pages are in use. Unpublish a page in your account or upgrade to publish another."
          )
        : null

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
                    if (readPage() !== page.id)
                      window.history.pushState(
                        null,
                        "",
                        `#/settings/${page.id}`
                      )
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
                <div className="settings-row">
                  <div className="settings-row-copy">
                    <strong>{t("UI scale")}</strong>
                    <small>
                      {t("Resize the entire interface. Saved for all windows.")}
                    </small>
                  </div>
                  <select
                    aria-label={t("UI scale")}
                    value={preferences.uiZoom ?? 1}
                    onChange={(event) =>
                      void updatePreferences({
                        uiZoom: Number(event.target.value),
                      })
                    }
                  >
                    {[0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2].map((value) => (
                      <option key={value} value={value}>
                        {Math.round(value * 100)}%
                      </option>
                    ))}
                  </select>
                </div>
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
                    <strong>{t("Time zone")}</strong>
                    <small>
                      {t(
                        "Follow the system time zone or choose a fixed zone for date and time displays."
                      )}
                    </small>
                  </div>
                  <TimeZonePicker
                    value={preferences.timeZone}
                    label={t("Time zone")}
                    t={t}
                    onChange={(timeZone) =>
                      void updatePreferences({ timeZone })
                    }
                  />
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
            </section>

            <section
              aria-labelledby="settings-files"
              hidden={activePage !== "files"}
            >
              <h2 id="settings-files">{t("Files")}</h2>
              <div className="settings-group" data-default-file-editors>
                <div className="settings-row" data-markdown-file-editing-mode>
                  <div className="settings-row-copy">
                    <strong>{t("Markdown file editor")}</strong>
                    <small>
                      {t(
                        "Choose the default editor for .md and .markdown files."
                      )}
                    </small>
                  </div>
                  <select
                    className="settings-shell-select"
                    aria-label={t("Markdown file editor")}
                    data-markdown-file-editing-mode-select
                    value={selectedMarkdownEditor}
                    onChange={(event) => {
                      const nextKey = event.currentTarget.value
                      void (async () => {
                        try {
                          if (nextKey === "wysiwyg" || nextKey === "source") {
                            if (window.eidosLite?.setPluginDefault) {
                              await window.eidosLite.setPluginDefault(
                                ".md",
                                null
                              )
                              await window.eidosLite.setPluginDefault(
                                ".markdown",
                                null
                              )
                            }
                            await updatePreferences({
                              markdownFileEditingMode:
                                nextKey as EidosLiteMarkdownEditingMode,
                            })
                          } else if (window.eidosLite?.setPluginDefault) {
                            await window.eidosLite.setPluginDefault(
                              ".md",
                              nextKey
                            )
                            await window.eidosLite.setPluginDefault(
                              ".markdown",
                              nextKey
                            )
                          }
                          window.dispatchEvent(
                            new Event("eidos-plugins-changed")
                          )
                          if (window.eidosLite?.listPlugins) {
                            setPluginListing(
                              await window.eidosLite.listPlugins()
                            )
                          }
                        } catch (cause) {
                          setError(
                            cause instanceof Error
                              ? cause.message
                              : String(cause)
                          )
                        }
                      })()
                    }}
                  >
                    {markdownPluginEditors.length > 0 ? (
                      <>
                        <optgroup label={t("Built-in")}>
                          {MARKDOWN_EDITOR_OPTIONS.map((option) => (
                            <option
                              key={option.value}
                              value={option.value}
                              data-markdown-file-editing-mode={option.value}
                            >
                              {t(option.label)}
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label={t("Plugins")}>
                          {markdownPluginEditors.map((p) => (
                            <option key={p.key} value={p.key}>
                              {p.label}
                            </option>
                          ))}
                        </optgroup>
                      </>
                    ) : (
                      MARKDOWN_EDITOR_OPTIONS.map((option) => (
                        <option
                          key={option.value}
                          value={option.value}
                          data-markdown-file-editing-mode={option.value}
                        >
                          {t(option.label)}
                        </option>
                      ))
                    )}
                  </select>
                </div>
                <div className="settings-row" data-html-file-open-mode>
                  <div className="settings-row-copy">
                    <strong>{t("HTML default open mode")}</strong>
                    <small>
                      {t(
                        "Choose how .html and .htm files open. Preview runs in a sandbox."
                      )}
                    </small>
                  </div>
                  <select
                    className="settings-shell-select"
                    aria-label={t("HTML default open mode")}
                    data-html-file-open-mode-select
                    value={selectedHtmlEditor}
                    onChange={(event) => {
                      const nextKey = event.currentTarget.value
                      void (async () => {
                        try {
                          if (nextKey === "preview" || nextKey === "source") {
                            if (window.eidosLite?.setPluginDefault) {
                              await window.eidosLite.setPluginDefault(
                                ".html",
                                null
                              )
                              await window.eidosLite.setPluginDefault(
                                ".htm",
                                null
                              )
                            }
                            await updatePreferences({
                              htmlFileOpenMode: nextKey as "preview" | "source",
                            })
                          } else if (window.eidosLite?.setPluginDefault) {
                            await window.eidosLite.setPluginDefault(
                              ".html",
                              nextKey
                            )
                            await window.eidosLite.setPluginDefault(
                              ".htm",
                              nextKey
                            )
                          }
                          window.dispatchEvent(
                            new Event("eidos-plugins-changed")
                          )
                          if (window.eidosLite?.listPlugins) {
                            setPluginListing(
                              await window.eidosLite.listPlugins()
                            )
                          }
                        } catch (cause) {
                          setError(
                            cause instanceof Error
                              ? cause.message
                              : String(cause)
                          )
                        }
                      })()
                    }}
                  >
                    {htmlPluginEditors.length > 0 ? (
                      <>
                        <optgroup label={t("Built-in")}>
                          <option
                            value="preview"
                            data-html-file-open-mode="preview"
                          >
                            {t("Preview")}
                          </option>
                          <option
                            value="source"
                            data-html-file-open-mode="source"
                          >
                            {t("Source")}
                          </option>
                        </optgroup>
                        <optgroup label={t("Plugins")}>
                          {htmlPluginEditors.map((p) => (
                            <option key={p.key} value={p.key}>
                              {p.label}
                            </option>
                          ))}
                        </optgroup>
                      </>
                    ) : (
                      <>
                        <option
                          value="preview"
                          data-html-file-open-mode="preview"
                        >
                          {t("Preview")}
                        </option>
                        <option
                          value="source"
                          data-html-file-open-mode="source"
                        >
                          {t("Source")}
                        </option>
                      </>
                    )}
                  </select>
                </div>
                {fileEditorGroups.map((group) => (
                  <div className="settings-row" key={group.label}>
                    <div className="settings-row-copy">
                      <strong>{group.label}</strong>
                      <small>
                        {t(
                          "Choose the default editor for {extensions} files.",
                          { extensions: group.label }
                        )}
                      </small>
                    </div>
                    <select
                      className="settings-shell-select"
                      aria-label={group.label}
                      value={group.selected}
                      onChange={(event) => {
                        const nextKey = event.currentTarget.value
                        void (async () => {
                          try {
                            for (const ext of group.extensions) {
                              await window.eidosLite.setPluginDefault(
                                ext,
                                nextKey === "builtin" ? null : nextKey
                              )
                            }
                            window.dispatchEvent(
                              new Event("eidos-plugins-changed")
                            )
                            if (window.eidosLite.listPlugins) {
                              setPluginListing(
                                await window.eidosLite.listPlugins()
                              )
                            }
                          } catch (cause) {
                            setError(
                              cause instanceof Error
                                ? cause.message
                                : String(cause)
                            )
                          }
                        })()
                      }}
                    >
                      {group.options.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </section>

            <section
              aria-labelledby="settings-account-sync"
              hidden={activePage !== "account-sync"}
            >
              <h2 id="settings-account-sync">{t("Account & Services")}</h2>
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
                          ? (syncAccount.account.user?.name ??
                            t("Eidos account"))
                          : t("Eidos account")}
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
              <h3 className="settings-subheading">
                <Cloud aria-hidden="true" />
                {t("Sync")}
              </h3>
              <div className="settings-group" data-settings-sync>
                {syncAccount ? (
                  <>
                    <div className="settings-row">
                      <div className="settings-row-copy">
                        <strong>{t("Sync access")}</strong>
                        <small>{syncAccessLabel}</small>
                      </div>
                      <div className="settings-row-actions">
                        <button
                          type="button"
                          className="settings-button settings-button-quiet"
                          onClick={() => void manageSyncAccess()}
                        >
                          {t("Manage Sync access")} <ExternalLink />
                        </button>
                        <button
                          type="button"
                          className="settings-button"
                          disabled={syncStatusBusy}
                          onClick={() => void refreshSyncStatus()}
                        >
                          <RefreshCw />
                          {syncStatusBusy ? t("Refreshing…") : t("Refresh")}
                        </button>
                      </div>
                    </div>
                    <div className="settings-row">
                      <div className="settings-row-copy">
                        <strong>{t("Device")}</strong>
                        <small>{syncDeviceLabel}</small>
                      </div>
                    </div>
                    {syncQuotaBytes !== undefined &&
                    syncUsedBytes !== undefined ? (
                      <UsageMeter
                        title={t("Sync storage")}
                        total={syncQuotaBytes}
                        usedLabel={t("{used} of {total} used", {
                          used: formatUsageBytes(syncUsedBytes),
                          total: formatUsageBytes(syncQuotaBytes),
                        })}
                        freeLabel={t("Free")}
                        segments={[
                          {
                            key: "used",
                            label: t("Synced data"),
                            value: syncUsedBytes,
                            tone: "accent",
                          },
                          {
                            key: "reserved",
                            label: t("Reserved"),
                            value: syncReservedBytes,
                            tone: "muted",
                          },
                        ]}
                      />
                    ) : null}
                  </>
                ) : (
                  <div className="settings-row">
                    <div className="settings-row-copy">
                      <strong>{t("Sync")}</strong>
                      <small>
                        {t("Sync status has not been checked yet.")}
                      </small>
                    </div>
                  </div>
                )}
              </div>
              <h3 className="settings-subheading">
                <Upload aria-hidden="true" />
                {t("Publish")}
              </h3>
              <div className="settings-group" data-settings-publish>
                {publishAccountEnabled ? (
                  <>
                    <div className="settings-row settings-row-stacked settings-row-publish-plan">
                      <div className="settings-row-copy">
                        <strong>{publishPlanTitle}</strong>
                        <small>{publishPlanSummary}</small>
                        {publishAccount?.plan === "free" ? (
                          <small>
                            {t(
                              "Markdown up to 2 MiB · 20 attachments, 25 MiB each · 20 new versions per day"
                            )}
                          </small>
                        ) : null}
                        {publishRestriction ? (
                          <small className="settings-publish-warning">
                            {publishRestriction}
                          </small>
                        ) : null}
                      </div>
                      <div className="settings-row-actions">
                        {publishAccount ? (
                          <button
                            type="button"
                            className="settings-button settings-button-quiet"
                            onClick={() =>
                              void window.eidosLite.openExternalUrl(
                                publishAccount.accountUrl
                              )
                            }
                          >
                            {t("Manage published pages")} <ExternalLink />
                          </button>
                        ) : null}
                        {publishAccount?.plan === "free" ? (
                          <button
                            type="button"
                            className="settings-button settings-button-quiet"
                            onClick={() =>
                              void window.eidosLite.openExternalUrl(
                                publishAccount.pricingUrl
                              )
                            }
                          >
                            {t("View paid plans")} <ExternalLink />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="settings-button"
                          disabled={publishAccountRefreshing}
                          onClick={() =>
                            void refreshPublishAccount({ force: true })
                          }
                        >
                          <RefreshCw />
                          {publishAccountRefreshing
                            ? t("Refreshing…")
                            : t("Refresh")}
                        </button>
                      </div>
                    </div>
                    {publishAccount &&
                    publishUsedBytes !== null &&
                    publishQuotaBytes ? (
                      <UsageMeter
                        title={t("Publish storage")}
                        total={publishQuotaBytes}
                        usedLabel={t("{used} of {total} used", {
                          used: formatUsageBytes(publishUsedBytes),
                          total: formatUsageBytes(publishQuotaBytes),
                        })}
                        freeLabel={t("Free")}
                        segments={[
                          {
                            key: "used",
                            label: t("Published files"),
                            value: publishUsedBytes,
                            tone: "accent",
                          },
                        ]}
                      />
                    ) : null}
                    {publishAccount?.plan === "free" &&
                    publishAccount.activeSlugs !== null ? (
                      <UsageMeter
                        title={t("Published pages")}
                        total={10}
                        usedLabel={t("{used} of {total} used", {
                          used: String(publishAccount.activeSlugs.length),
                          total: "10",
                        })}
                        freeLabel={t("Free")}
                        formatValue={(value) => String(Math.round(value))}
                        segments={[
                          {
                            key: "used",
                            label: t("Published pages"),
                            value: publishAccount.activeSlugs.length,
                            tone: "accent",
                          },
                        ]}
                      />
                    ) : null}
                  </>
                ) : (
                  <div className="settings-row">
                    <div className="settings-row-copy">
                      <strong>{t("Publish")}</strong>
                      <small>{t("Sign in to manage Publish.")}</small>
                    </div>
                  </div>
                )}
              </div>
              <p className="settings-section-note">
                {t(
                  "Sign in once to use Sync and Publish. Your credentials remain in secure system storage; only your email and avatar are cached for the interface."
                )}
              </p>
            </section>

            <section
              aria-label={t("Plugins")}
              id="settings-plugins"
              hidden={activePage !== "plugins"}
            >
              {activePage === "plugins" && (
                <PluginManager
                  variant="settings"
                  builtins={[
                    {
                      id: "builtin.terminal",
                      name: t("Terminal"),
                      enabled: preferences.builtInPlugins.terminal,
                      details: (
                        <div className="settings-group">
                          <div
                            className="settings-row"
                            data-built-in-plugin="terminal"
                          >
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
                              aria-checked={preferences.builtInPlugins.terminal}
                              onClick={() =>
                                void updatePreferences({
                                  builtInPlugins: {
                                    terminal:
                                      !preferences.builtInPlugins.terminal,
                                  },
                                })
                              }
                            >
                              <span />
                            </button>
                          </div>
                          <div
                            className="settings-row settings-row-stacked"
                            data-terminal-layout
                          >
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
                              data-segment-count={
                                TERMINAL_LAYOUT_OPTIONS.length
                              }
                              role="radiogroup"
                              aria-label={t("Terminal layout")}
                            >
                              {TERMINAL_LAYOUT_OPTIONS.map((option) => (
                                <button
                                  type="button"
                                  role="radio"
                                  data-terminal-layout={option.value}
                                  aria-checked={
                                    preferences.terminalLayout === option.value
                                  }
                                  disabled={
                                    !preferences.builtInPlugins.terminal
                                  }
                                  key={option.value}
                                  onClick={() =>
                                    void updatePreferences({
                                      terminalLayout: option.value,
                                    })
                                  }
                                >
                                  {t(option.label)}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div
                            className="settings-row settings-row-stacked"
                            data-terminal-shell
                          >
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
                              disabled={
                                terminalShellsLoading ||
                                !preferences.builtInPlugins.terminal
                              }
                              onChange={(event) =>
                                void updatePreferences({
                                  terminalShell:
                                    event.currentTarget.value || null,
                                })
                              }
                            >
                              <option value="">
                                {terminalShellsLoading
                                  ? t("Detecting shells…")
                                  : systemTerminalShell
                                    ? t("System default — {shell}", {
                                        shell: systemTerminalShell.name,
                                      })
                                    : t("System default")}
                              </option>
                              {selectedTerminalShellUnavailable ? (
                                <option value={preferences.terminalShell ?? ""}>
                                  {t("Unavailable — {shell}", {
                                    shell: preferences.terminalShell ?? "",
                                  })}
                                </option>
                              ) : null}
                              {terminalShells.map((shell) => (
                                <option
                                  key={shell.executable}
                                  value={shell.executable}
                                >
                                  {shell.name} — {shell.executable}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      ),
                    },
                  ]}
                />
              )}
            </section>

            <section
              aria-labelledby="settings-shortcuts"
              hidden={activePage !== "shortcuts"}
            >
              <h2 id="settings-shortcuts">{t("Keyboard Shortcuts")}</h2>
              <KeyboardShortcutSettings
                builtInPlugins={preferences.builtInPlugins}
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
                    <strong>{t("Current version")}</strong>
                    <small>{appInfo?.version ?? "…"}</small>
                  </div>
                  <button
                    type="button"
                    onClick={() => void window.eidosLite.openWhatsNew()}
                  >
                    {t("What's new")} →
                  </button>
                </div>
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
                  <img src={appLogo} alt="" />
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
                  onClick={() => void openDestination("github")}
                >
                  <span>{t("Source code on GitHub")}</span>
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
