import {
  useState,
  useId,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  type ReactNode,
  type KeyboardEvent,
} from "react"
import {
  ArrowLeft,
  CheckCircle2,
  Code2,
  Copy,
  Check,
  Download,
  ExternalLink,
  Shield,
  Layers,
  Terminal,
  Settings,
  Info,
  CircleSlash,
  FileCode,
  HardDrive,
  ArrowUpCircle,
  X,
} from "lucide-react"
import {
  type PluginListing,
  type MarketplacePlugin,
  type PluginInstallTask,
  isPluginUpdateAvailable,
} from "../shared/plugins"
import { renderMarkdownToHtml } from "@eidos.space/markdown/static"
import { PluginIcon, getPluginIconBadgeStyle } from "./plugin-icon"
import { PluginPage } from "./plugin-workspace"
import { PluginConnectionSettings } from "./plugin-connection-settings"
import { PluginMarketplaceInstallButton } from "./plugin-marketplace"
import { useEidosLiteI18n } from "./i18n"
import {
  pluginHostInfo,
  checkPluginCompatibility,
} from "@eidos.space/plugin-runtime/compatibility"
import type { PluginManifest, SettingValue } from "@eidos.space/plugin-sdk"

export interface PluginDetailViewProps {
  plugin?: PluginListing["plugins"][number]
  builtin?: {
    id: string
    name: string
    enabled: boolean
    details: ReactNode
  }
  marketplacePlugin?: MarketplacePlugin | null
  spaceAvailable?: boolean
  busy?: boolean
  installTask?: PluginInstallTask
  installing?: boolean
  installDisabled?: boolean
  error?: string | null
  onBack(): void
  onInstall?(): Promise<void> | void
  onToggleEnable(): Promise<void> | void
  onSelectTheme?(): Promise<void> | void
  onUninstall(): Promise<void> | void
  onOpenPage?(key: string): void
  variant?: "page" | "settings"
}

type DetailTab = "details" | "features" | "settings" | "runtime" | "properties"

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function PluginDetailView({
  plugin,
  builtin,
  marketplacePlugin,
  spaceAvailable = false,
  busy = false,
  installTask,
  installing = false,
  installDisabled = false,
  error = null,
  onBack,
  onInstall,
  onToggleEnable,
  onSelectTheme,
  onUninstall,
  onOpenPage,
  variant = "page",
}: PluginDetailViewProps) {
  const { t } = useEidosLiteI18n()
  const id = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const [isMobile, setIsMobile] = useState(variant === "settings")
  const [activeTab, setActiveTab] = useState<DetailTab>("details")
  const [copiedId, setCopiedId] = useState(false)
  const [copiedHash, setCopiedHash] = useState(false)
  const [activeScreenshot, setActiveScreenshot] = useState<{
    src: string
    alt: string
  } | null>(null)

  useEffect(() => {
    if (!activeScreenshot) return
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        setActiveScreenshot(null)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [activeScreenshot])

  const manifest = plugin?.manifest
  const isTheme = manifest?.kind === "theme"
  const compatibility =
    manifest && !plugin?.unavailable
      ? checkPluginCompatibility(manifest, "eidos-lite")
      : null
  const marketplaceOnly = !plugin && !builtin && Boolean(marketplacePlugin)
  const pluginId = manifest?.id ?? builtin?.id ?? marketplacePlugin?.id ?? ""
  const pluginVersion =
    manifest?.version ?? marketplacePlugin?.version ?? "1.0.0"
  const pluginIcon = manifest?.icon ?? marketplacePlugin?.icon
  const hasUpdate = Boolean(
    plugin &&
    manifest &&
    marketplacePlugin &&
    isPluginUpdateAvailable(manifest.version, marketplacePlugin.version)
  )

  useEffect(() => {
    if (variant === "settings") {
      setIsMobile(true)
      return
    }
    const el = containerRef.current
    if (!el || typeof ResizeObserver === "undefined") {
      const mq = window.matchMedia?.("(max-width: 800px)")
      setIsMobile(Boolean(mq?.matches))
      const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
      mq?.addEventListener?.("change", handler)
      return () => mq?.removeEventListener?.("change", handler)
    }
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setIsMobile(entry.contentRect.width < 768)
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [variant])

  useEffect(() => {
    if (!isMobile && activeTab === "properties") {
      setActiveTab("details")
    }
  }, [isMobile, activeTab])

  useEffect(() => {
    if (
      marketplaceOnly &&
      activeTab !== "details" &&
      activeTab !== "properties"
    ) {
      setActiveTab("details")
    }
  }, [marketplaceOnly, activeTab])

  useEffect(() => {
    if (isTheme && (activeTab === "features" || activeTab === "settings")) {
      setActiveTab("details")
    }
  }, [isTheme, activeTab])

  const [readmeContent, setReadmeContent] = useState<string | null>(null)
  const [readmeLoading, setReadmeLoading] = useState(false)

  const repo = marketplacePlugin?.repo

  useEffect(() => {
    if (!pluginId || !window.eidosLite?.pluginReadme) {
      setReadmeContent(null)
      return
    }
    let cancelled = false
    setReadmeLoading(true)
    void window.eidosLite
      .pluginReadme(pluginId)
      .then((content) => {
        if (!cancelled) setReadmeContent(content)
      })
      .catch(() => {
        if (!cancelled) setReadmeContent(null)
      })
      .finally(() => {
        if (!cancelled) setReadmeLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [pluginId])

  const readmeHtml = useMemo(() => {
    if (!readmeContent) return null
    let processed = readmeContent
    if (repo) {
      const rawBase = `https://raw.githubusercontent.com/${repo}/main/`
      processed = processed.replace(
        /!\[([^\]]*)\]\((?!(?:https?:\/\/|data:))([^)]+)\)/g,
        (_match, alt, src) => {
          const cleanSrc = src.trim().replace(/^\.?\//, "")
          return `![${alt}](${rawBase}${cleanSrc})`
        }
      )
    }
    try {
      return renderMarkdownToHtml(processed)
    } catch {
      return null
    }
  }, [readmeContent, repo])

  const settingsView = manifest?.placements?.find(
    (p) => p.location === "plugin/settings"
  )
  const hasConnections = !!Object.keys(manifest?.connections ?? {}).length
  const hasDeclarativeSettings = !!Object.keys(manifest?.settings ?? {}).length
  const pageView = manifest?.views?.find((v) => v.context === "page")
  const canOpenPage =
    pageView &&
    onOpenPage &&
    manifest?.placements?.some(
      (placement) =>
        placement.location === "navigation" && placement.view === pageView.id
    )

  const views = manifest?.views ?? []
  const actions = manifest?.actions ?? []
  const formatters = manifest?.formatters ?? []
  const placements = manifest?.placements ?? []
  const totalContributions = views.length + actions.length + formatters.length

  const screenshots = useMemo(() => {
    if (!marketplacePlugin?.repo || !marketplacePlugin.screenshots?.length) {
      return []
    }
    return marketplacePlugin.screenshots.map((s) => ({
      src: `https://raw.githubusercontent.com/${marketplacePlugin.repo}/main/${s.path}`,
      alt: s.alt,
    }))
  }, [marketplacePlugin?.repo, marketplacePlugin?.screenshots])

  const copyText = (text: string, isHash = false) => {
    if (!navigator.clipboard) return
    void navigator.clipboard.writeText(text)
    if (isHash) {
      setCopiedHash(true)
      setTimeout(() => setCopiedHash(false), 2000)
    } else {
      setCopiedId(true)
      setTimeout(() => setCopiedId(false), 2000)
    }
  }

  const tabs: { key: DetailTab; label: string; count?: number }[] =
    marketplaceOnly
      ? [
          { key: "details", label: t("Details") },
          ...(isMobile
            ? [{ key: "properties" as const, label: t("Properties") }]
            : []),
        ]
      : isTheme
        ? [
            { key: "details", label: t("Details") },
            { key: "runtime", label: t("Runtime & Security") },
            ...(isMobile
              ? [{ key: "properties" as const, label: t("Properties") }]
              : []),
          ]
        : [
            { key: "details", label: t("Details") },
            {
              key: "features",
              label: t("Features"),
              count: totalContributions > 0 ? totalContributions : undefined,
            },
            { key: "runtime", label: t("Runtime & Security") },
            ...(isMobile
              ? [{ key: "properties" as const, label: t("Properties") }]
              : []),
            ...(settingsView || hasConnections || hasDeclarativeSettings
              ? [{ key: "settings" as const, label: t("Settings") }]
              : []),
          ]

  const switchTab = useCallback((tabKey: DetailTab) => {
    setActiveTab(tabKey)
    containerRef.current
      ?.closest(".plugin-management-panel, .settings-content")
      ?.scrollTo({ top: 0, behavior: "instant" })
  }, [])

  const handleTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number
  ) => {
    let next = index
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length
    else if (event.key === "ArrowLeft")
      next = (index + tabs.length - 1) % tabs.length
    else if (event.key === "Home") next = 0
    else if (event.key === "End") next = tabs.length - 1
    else return
    event.preventDefault()
    switchTab(tabs[next].key)
    const targetButton = event.currentTarget.parentElement?.children[next] as
      | HTMLElement
      | undefined
    targetButton?.focus()
  }

  const displayName =
    builtin?.name ?? manifest?.name ?? marketplacePlugin?.name ?? "Plugin"
  const publisher = marketplacePlugin?.repo
    ? marketplacePlugin.repo.split("/")[0]
    : manifest?.id?.split(".")[0]
  const pluginDescription =
    marketplacePlugin?.description ||
    (manifest as { description?: string })?.description ||
    (builtin
      ? t(
          "Included with Eidos Lite. Can be disabled, but not uninstalled. Settings apply to this device."
        )
      : isTheme
        ? t("This theme customizes the Eidos Lite interface on this device.")
        : hasConnections
          ? t(
              "This plugin uses authenticated connections configured in its settings."
            )
          : t(
              "This plugin extends Eidos with customizable views, commands, and formatting tools. All processing runs directly on your local device."
            ))
  const sidebarContent = (
    <div className="plugin-sidebar-content">
      {/* Identity & Properties */}
      <div className="plugin-sidebar-group">
        <h3 className="plugin-sidebar-heading">{t("Properties")}</h3>
        <dl className="plugin-prop-list">
          <div className="plugin-prop-item">
            <dt>{t("Identifier")}</dt>
            <dd>
              <code>{pluginId}</code>
            </dd>
          </div>
          <div className="plugin-prop-item">
            <dt>{t("Version")}</dt>
            <dd>
              {hasUpdate && marketplacePlugin ? (
                <span>
                  v{manifest?.version} → v{marketplacePlugin.version}{" "}
                  <span
                    className="plugin-pill-status is-update"
                    style={{ marginLeft: 6, verticalAlign: "middle" }}
                  >
                    {t("Update available")}
                  </span>
                </span>
              ) : (
                pluginVersion
              )}
            </dd>
          </div>
          <div className="plugin-prop-item">
            <dt>{t("Minimum Plugin API")}</dt>
            <dd>{manifest?.requires?.pluginApi ?? t("Undeclared")}</dd>
          </div>
          <div className="plugin-prop-item">
            <dt>{t("Host Plugin API")}</dt>
            <dd>{pluginHostInfo("eidos-lite").pluginApiVersion}</dd>
          </div>
          <div className="plugin-prop-item">
            <dt>{t("Type")}</dt>
            <dd>
              {builtin
                ? t("Built-in")
                : isTheme
                  ? t("Theme")
                  : marketplaceOnly
                    ? t("Marketplace")
                    : plugin?.developmentPath
                      ? t("Development")
                      : t("Packaged")}
            </dd>
          </div>
        </dl>
      </div>

      {/* Capabilities count */}
      {!isTheme && (
        <div className="plugin-sidebar-group">
          <h3 className="plugin-sidebar-heading">{t("Capabilities")}</h3>
          <dl className="plugin-prop-list">
            <div className="plugin-prop-item">
              <dt>{t("Views")}</dt>
              <dd>{views.length}</dd>
            </div>
            <div className="plugin-prop-item">
              <dt>{t("Actions & Commands")}</dt>
              <dd>{actions.length}</dd>
            </div>
            <div className="plugin-prop-item">
              <dt>{t("Formatters")}</dt>
              <dd>{formatters.length}</dd>
            </div>
          </dl>
        </div>
      )}

      {/* Security Summary */}
      <div className="plugin-sidebar-group">
        <h3 className="plugin-sidebar-heading">{t("Security & Sandbox")}</h3>
        <dl className="plugin-prop-list">
          <div className="plugin-prop-item">
            <dt>{t("Execution")}</dt>
            <dd>
              {t(
                isTheme
                  ? "No executable code"
                  : "Isolated iframe sandbox (null origin)"
              )}
            </dd>
          </div>
          <div className="plugin-prop-item">
            <dt>{t("Network Access")}</dt>
            <dd>
              {isTheme ? (
                <span>{t("No network access")}</span>
              ) : hasConnections ? (
                <span>{t("Authenticated connections")}</span>
              ) : manifest?.browser?.networkOrigins?.length ? (
                <span>{manifest.browser.networkOrigins.length} domain(s)</span>
              ) : (
                <span>{t("No external network access (100% offline)")}</span>
              )}
            </dd>
          </div>
        </dl>
      </div>

      {/* Resources & Links */}
      <div className="plugin-sidebar-group">
        <h3 className="plugin-sidebar-heading">{t("Resources")}</h3>
        <div className="plugin-resource-links">
          {marketplacePlugin?.repo ? (
            <a
              href={
                marketplacePlugin.repo.startsWith("http")
                  ? marketplacePlugin.repo
                  : `https://github.com/${marketplacePlugin.repo}`
              }
              target="_blank"
              rel="noreferrer"
              className="plugin-resource-link"
              onClick={(e) => {
                e.preventDefault()
                const url = marketplacePlugin.repo.startsWith("http")
                  ? marketplacePlugin.repo
                  : `https://github.com/${marketplacePlugin.repo}`
                void window.eidosLite?.openExternalUrl(url)
              }}
            >
              <ExternalLink size={13} aria-hidden="true" />
              <span>{t("Repository")}</span>
            </a>
          ) : null}
          {plugin?.developmentPath ? (
            <div className="plugin-resource-dev-path">
              <span className="text-muted-foreground text-xs">
                {t("Load development source…")}:
              </span>
              <code className="break-all text-[11px] block mt-1">
                {plugin.developmentPath}
              </code>
            </div>
          ) : null}
          {!marketplacePlugin?.repo && !plugin?.developmentPath ? (
            <p className="text-muted-foreground text-xs">
              {t("Eidos Plugins 1.0 Local Runtime")}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )

  return (
    <div
      ref={containerRef}
      className={`plugin-manager plugin-detail-container${
        variant === "settings" ? " plugin-manager-settings" : ""
      }${isMobile ? " is-mobile" : ""}`}
    >
      {/* Back to list navigation (only in settings modal; page mode uses titlebar breadcrumb) */}
      {variant === "settings" && (
        <div className="plugin-detail-topbar">
          <button
            type="button"
            className="settings-button settings-button-quiet plugin-detail-back"
            onClick={onBack}
          >
            <ArrowLeft size={14} aria-hidden="true" />
            <span>{t("Plugins")}</span>
          </button>
        </div>
      )}

      {/* Hero Header Area */}
      <header className="plugin-detail-hero">
        <div
          className="plugin-detail-icon-box"
          style={getPluginIconBadgeStyle(pluginId, displayName, pluginIcon)}
        >
          <PluginIcon
            icon={pluginIcon}
            id={pluginId}
            name={displayName}
            className="plugin-detail-hero-icon"
          />
        </div>

        <div className="plugin-detail-meta">
          <div className="plugin-detail-title-row">
            <h1 tabIndex={-1} className="plugin-detail-title">
              {displayName}
            </h1>
            {plugin?.developmentPath && (
              <span className="plugin-tag-dev">
                <Code2 size={12} aria-hidden="true" />
                {t("Development")}
              </span>
            )}
          </div>

          <div className="plugin-detail-subrow">
            {publisher ? (
              <span className="plugin-detail-publisher">{publisher}</span>
            ) : null}
            <span className="plugin-detail-id">
              <code>{pluginId}</code>
              <button
                type="button"
                className="plugin-copy-btn"
                title={copiedId ? t("Copied to clipboard") : t("Identifier")}
                onClick={() => copyText(pluginId)}
              >
                {copiedId ? <Check size={11} /> : <Copy size={11} />}
              </button>
            </span>
            <span className="plugin-detail-dot">·</span>
            <span className="plugin-detail-version">
              {builtin
                ? t("Built-in")
                : plugin?.unavailable
                  ? t("Unknown version")
                  : `v${pluginVersion}`}
            </span>
            <span className="plugin-detail-dot">·</span>
            {hasUpdate && marketplacePlugin && (
              <>
                <span className="plugin-status-pill is-update">
                  <ArrowUpCircle
                    size={12}
                    className="status-icon"
                    aria-hidden="true"
                  />
                  <span>
                    {t("Update available: v{version}", {
                      version: marketplacePlugin.version,
                    })}
                  </span>
                </span>
                <span className="plugin-detail-dot">·</span>
              </>
            )}
            {plugin ? (
              <span
                className={`plugin-status-pill ${
                  plugin.enabled ? "is-enabled" : "is-disabled"
                }`}
              >
                {plugin.unavailable ? (
                  <>
                    <CircleSlash
                      size={12}
                      className="status-icon"
                      aria-hidden="true"
                    />
                    <span>{t("Unavailable")}</span>
                  </>
                ) : plugin.enabled ? (
                  <>
                    <CheckCircle2
                      size={12}
                      className="status-icon"
                      aria-hidden="true"
                    />
                    <span>
                      {manifest?.theme
                        ? t("Active theme")
                        : t("Enabled in this Space")}
                    </span>
                  </>
                ) : (
                  <>
                    <CircleSlash
                      size={12}
                      className="status-icon"
                      aria-hidden="true"
                    />
                    <span>
                      {manifest?.theme
                        ? t("Installed theme")
                        : t("Disabled in this Space")}
                    </span>
                  </>
                )}
              </span>
            ) : marketplaceOnly ? (
              <span className="plugin-status-pill is-disabled">
                <Download
                  size={12}
                  className="status-icon"
                  aria-hidden="true"
                />
                <span>{t("Not installed")}</span>
              </span>
            ) : (
              <span className="plugin-status-pill is-builtin">
                <Shield size={12} className="status-icon" aria-hidden="true" />
                <span>{t("Built-in")}</span>
              </span>
            )}
          </div>

          <p className="plugin-detail-desc">{pluginDescription}</p>

          <div className="plugin-detail-actions">
            {hasUpdate && onInstall && (
              <PluginMarketplaceInstallButton
                same={false}
                installed={true}
                hasUpdate={true}
                task={
                  installTask ??
                  (installing
                    ? {
                        id: marketplacePlugin?.id ?? "",
                        status: "installing",
                        percent: 100,
                      }
                    : undefined)
                }
                unavailable={installDisabled}
                onInstall={() => void onInstall()}
              />
            )}

            {marketplaceOnly && onInstall && (
              <PluginMarketplaceInstallButton
                same={false}
                installed={false}
                task={
                  installTask ??
                  (installing
                    ? {
                        id: marketplacePlugin?.id ?? "",
                        status: "installing",
                        percent: 100,
                      }
                    : undefined)
                }
                unavailable={installDisabled}
                onInstall={() => void onInstall()}
              />
            )}

            {plugin && manifest && (
              <>
                {plugin.unavailable ? null : manifest.theme ? (
                  <button
                    className={`settings-button ${plugin.enabled ? "" : "settings-button-primary"}`}
                    type="button"
                    disabled={busy}
                    aria-pressed={plugin.enabled}
                    onClick={() => void onSelectTheme?.()}
                  >
                    {plugin.enabled ? t("Use default theme") : t("Apply theme")}
                  </button>
                ) : spaceAvailable ? (
                  <button
                    className={`settings-button ${
                      plugin.enabled ? "" : "settings-button-primary"
                    }`}
                    type="button"
                    disabled={busy}
                    aria-pressed={plugin.enabled}
                    onClick={() => void onToggleEnable()}
                  >
                    {plugin.enabled ? t("Disable") : t("Enable")}
                  </button>
                ) : null}
                <button
                  className="settings-button"
                  type="button"
                  disabled={busy}
                  onClick={() => void onUninstall()}
                >
                  {t("Uninstall")}
                </button>
              </>
            )}

            {canOpenPage && (
              <button
                type="button"
                className="settings-button"
                disabled={busy || !plugin?.enabled}
                onClick={() => onOpenPage?.(`${manifest?.id}/${pageView.id}`)}
              >
                <ExternalLink size={12} aria-hidden="true" />
                <span>{t("Open")}</span>
              </button>
            )}

            {(settingsView || hasConnections) && (
              <button
                type="button"
                className={`settings-button ${
                  activeTab === "settings"
                    ? "settings-button-active"
                    : "settings-button-quiet"
                }`}
                onClick={() => switchTab("settings")}
              >
                <Settings size={12} aria-hidden="true" />
                <span>{t("Settings")}</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {error && (
        <p role="alert" className="plugin-manager-error">
          {error}
        </p>
      )}
      {plugin?.unavailable && (
        <p role="alert" className="plugin-manager-error">
          {t("Installed plugin cannot be read. Reinstall or uninstall it.")}
        </p>
      )}
      {compatibility && !compatibility.compatible && (
        <p role="alert" className="plugin-manager-error">
          {compatibility.message}
        </p>
      )}

      {/* Tabs navigation */}
      <div className="plugin-detail-tabs" role="tablist">
        {tabs.map((tabItem, index) => (
          <button
            key={tabItem.key}
            type="button"
            role="tab"
            id={`${id}-${tabItem.key}`}
            aria-controls={`${id}-${tabItem.key}-panel`}
            aria-selected={activeTab === tabItem.key}
            tabIndex={activeTab === tabItem.key ? 0 : -1}
            onClick={() => switchTab(tabItem.key)}
            onKeyDown={(e) => handleTabKeyDown(e, index)}
          >
            {tabItem.label}
            {tabItem.count !== undefined && (
              <span className="tab-count">{tabItem.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Main Two-Column Layout */}
      <div className="plugin-detail-body">
        {/* Left Column: Tab Content */}
        <main
          className="plugin-detail-main"
          id={`${id}-${activeTab}-panel`}
          role="tabpanel"
          aria-labelledby={`${id}-${activeTab}`}
        >
          {activeTab === "details" && (
            <div className="plugin-tab-details space-y-6">
              {screenshots.length > 0 && (
                <section
                  className="plugin-screenshots-section"
                  aria-label={t("Screenshots")}
                >
                  <div className="plugin-screenshots-scroll">
                    {screenshots.map((s, idx) => (
                      <figure key={idx} className="plugin-screenshot-figure">
                        <button
                          type="button"
                          className="plugin-screenshot-btn"
                          onClick={() => setActiveScreenshot(s)}
                          aria-label={t("View full image: {alt}", {
                            alt: s.alt,
                          })}
                        >
                          <img
                            src={s.src}
                            alt={s.alt}
                            loading="lazy"
                            className="plugin-screenshot-img"
                          />
                        </button>
                        <figcaption className="plugin-screenshot-caption">
                          {s.alt}
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                </section>
              )}
              {builtin ? (
                <div className="plugin-builtin-content">{builtin.details}</div>
              ) : readmeLoading && !readmeHtml ? (
                <div className="plugin-readme-loading">
                  <p role="status">{t("Loading documentation…")}</p>
                </div>
              ) : readmeHtml ? (
                <section
                  className="plugin-readme-card markdown-document eme-static"
                  dangerouslySetInnerHTML={{ __html: readmeHtml }}
                  onClick={(e) => {
                    const anchor = (e.target as HTMLElement).closest("a")
                    if (anchor && anchor.href) {
                      e.preventDefault()
                      void window.eidosLite?.openExternalUrl(anchor.href)
                    }
                  }}
                />
              ) : marketplaceOnly ? (
                <section className="plugin-section-card">
                  <h2 className="plugin-section-title">
                    <Info size={16} aria-hidden="true" />
                    <span>{t("Marketplace")}</span>
                  </h2>
                  <ul className="plugin-usage-steps">
                    <li>
                      <strong>{t("Repository")}:</strong>{" "}
                      <span>{marketplacePlugin?.repo}</span>
                    </li>
                    <li>
                      <strong>{t("Version")}:</strong>{" "}
                      <span>v{marketplacePlugin?.version}</span>
                    </li>
                    <li>
                      <strong>{t("Compatibility")}:</strong>{" "}
                      <span>{marketplacePlugin?.compatibility}</span>
                    </li>
                  </ul>
                  <p className="plugin-detail-description">
                    {t(
                      "Install this plugin to see its views, commands, and settings."
                    )}
                  </p>
                </section>
              ) : isTheme ? (
                <section className="plugin-section-card">
                  <h2 className="plugin-section-title">
                    <Info size={16} aria-hidden="true" />
                    <span>{t("How to Use")}</span>
                  </h2>
                  <p className="plugin-detail-description">
                    {t(
                      "Apply this theme to customize Eidos Lite on this device. Your light, dark, or system appearance setting still chooses the palette."
                    )}
                  </p>
                </section>
              ) : (
                <>
                  {/* Highlights of capabilities */}
                  {views.length > 0 && (
                    <section className="plugin-section-card">
                      <h2 className="plugin-section-title">
                        <Layers size={16} aria-hidden="true" />
                        <span>{t("Views")}</span>
                      </h2>
                      <div className="plugin-grid-cards">
                        {views.map((v) => (
                          <div key={v.id} className="plugin-feature-item">
                            <div className="plugin-feature-item-header">
                              <strong>{v.title}</strong>
                              <span className="plugin-chip">
                                {v.context === "table"
                                  ? t("Table view")
                                  : v.context === "page"
                                    ? t("Page")
                                    : t("Document view")}
                              </span>
                            </div>
                            <p className="plugin-feature-item-sub">
                              {v.context === "table"
                                ? t(
                                    "Add this view from any table view tabs menu."
                                  )
                                : v.context === "page"
                                  ? t("Standalone workspace page.")
                                  : t("Custom document presentation.")}
                            </p>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Usage Guide */}
                  <section className="plugin-section-card">
                    <h2 className="plugin-section-title">
                      <Info size={16} aria-hidden="true" />
                      <span>{t("How to Use")}</span>
                    </h2>
                    <ul className="plugin-usage-steps">
                      {views.some((v) => v.context === "table") && (
                        <li>
                          <strong>{t("Table view")}:</strong>{" "}
                          <span>
                            {t(
                              "Open any table in your .eidos file, click '+' in the view tab bar, and select this plugin view to create an interactive layout."
                            )}
                          </span>
                        </li>
                      )}
                      {views.some((v) => v.context === "page") && (
                        <li>
                          <strong>{t("Page")}:</strong>{" "}
                          <span>
                            {t(
                              "Navigate to this plugin's page from the sidebar navigation or click 'Open' above."
                            )}
                          </span>
                        </li>
                      )}
                      {formatters.length > 0 && (
                        <li>
                          <strong>{t("Formatter")}:</strong>{" "}
                          <span>
                            {t(
                              "Automatically formats matching files on save or via the 'Format Document' command."
                            )}
                          </span>
                        </li>
                      )}
                      {actions.length > 0 && (
                        <li>
                          <strong>{t("Command")}:</strong>{" "}
                          <span>
                            {t(
                              "Trigger commands from the Command Palette (Cmd/Ctrl + K)."
                            )}
                          </span>
                        </li>
                      )}
                    </ul>
                  </section>
                </>
              )}
            </div>
          )}

          {activeTab === "features" && (
            <div className="plugin-tab-features space-y-6">
              {/* Views */}
              {views.length > 0 && (
                <section className="plugin-section-card">
                  <h2 className="plugin-section-title">
                    <Layers size={16} aria-hidden="true" />
                    <span>{t("Views")}</span>
                  </h2>
                  <div className="plugin-table-list">
                    {views.map((view) => (
                      <div className="plugin-table-row" key={`view/${view.id}`}>
                        <div className="plugin-table-row-info">
                          <div className="plugin-table-row-name">
                            <strong>{view.title}</strong>
                            <code>{view.id}</code>
                          </div>
                          <div className="plugin-table-row-meta">
                            <span>
                              {view.context === "page"
                                ? t("Page")
                                : `${t(
                                    view.context === "table"
                                      ? "Table view"
                                      : "Document view"
                                  )} · ${
                                    view.access === "write"
                                      ? t("Read and write")
                                      : t("Read only")
                                  }`}
                            </span>
                            <span>·</span>
                            <span>{view.entry}</span>
                          </div>
                        </div>
                        {view.context === "page" && canOpenPage && (
                          <button
                            type="button"
                            className="settings-button"
                            disabled={busy || !plugin?.enabled}
                            onClick={() =>
                              onOpenPage?.(`${manifest?.id}/${view.id}`)
                            }
                          >
                            {t("Open")}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Actions & Commands */}
              {actions.length > 0 && (
                <section className="plugin-section-card">
                  <h2 className="plugin-section-title">
                    <Terminal size={16} aria-hidden="true" />
                    <span>{t("Actions & Commands")}</span>
                  </h2>
                  <div className="plugin-table-list">
                    {actions.map((action) => (
                      <div
                        className="plugin-table-row"
                        key={`action/${action.id}`}
                      >
                        <div className="plugin-table-row-info">
                          <div className="plugin-table-row-name">
                            <strong>{action.title}</strong>
                            <code>{action.id}</code>
                          </div>
                          <div className="plugin-table-row-meta">
                            <span>{action.context}</span>
                            {action.extensions?.length ? (
                              <>
                                <span>·</span>
                                <span>{action.extensions.join(", ")}</span>
                              </>
                            ) : null}
                            <span>·</span>
                            <span>
                              {action.access === "write"
                                ? t("Read and write")
                                : t("Read only")}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Formatters */}
              {formatters.length > 0 && (
                <section className="plugin-section-card">
                  <h2 className="plugin-section-title">
                    <FileCode size={16} aria-hidden="true" />
                    <span>{t("Formatters")}</span>
                  </h2>
                  <div className="plugin-table-list">
                    {formatters.map((formatter) => (
                      <div
                        className="plugin-table-row"
                        key={`formatter/${formatter.id}`}
                      >
                        <div className="plugin-table-row-info">
                          <div className="plugin-table-row-name">
                            <strong>{formatter.title}</strong>
                            <code>{formatter.id}</code>
                          </div>
                          <div className="plugin-table-row-meta">
                            <span>{formatter.extensions.join(", ")}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Placements */}
              {placements.length > 0 && (
                <section className="plugin-section-card">
                  <h2 className="plugin-section-title">
                    <Layers size={16} aria-hidden="true" />
                    <span>{t("Placements")}</span>
                  </h2>
                  <div className="plugin-table-list">
                    {placements.map((p, idx) => (
                      <div
                        className="plugin-table-row"
                        key={`placement/${idx}`}
                      >
                        <div className="plugin-table-row-info">
                          <div className="plugin-table-row-name">
                            <code>{p.location}</code>
                          </div>
                          <div className="plugin-table-row-meta">
                            {"view" in p && p.view ? (
                              <span>View: {p.view}</span>
                            ) : null}
                            {"action" in p && p.action ? (
                              <span>Action: {p.action}</span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}

          {activeTab === "settings" && (
            <div className="plugin-tab-settings">
              {hasDeclarativeSettings &&
                manifest &&
                plugin?.enabled &&
                spaceAvailable && (
                  <PluginDeclarativeSettings
                    key={`${manifest.id}:${plugin.hash}`}
                    manifest={manifest}
                  />
                )}
              {hasConnections &&
                manifest &&
                plugin?.enabled &&
                spaceAvailable && (
                  <PluginConnectionSettings
                    key={`${manifest.id}:${plugin.hash}`}
                    manifest={manifest}
                  />
                )}
              {settingsView && plugin?.enabled && spaceAvailable ? (
                <div className="plugin-settings-surface">
                  <PluginPage
                    pageKey={`${manifest?.id}/${settingsView.view}`}
                    onClose={() => {}}
                    onNavigate={onOpenPage ?? (() => {})}
                  />
                </div>
              ) : (settingsView || hasConnections || hasDeclarativeSettings) &&
                (!plugin?.enabled || !spaceAvailable) ? (
                <div className="plugin-empty-notice">
                  <p>
                    {t(
                      "Enable this plugin in this Space to configure its settings."
                    )}
                  </p>
                  {spaceAvailable && (
                    <button
                      className="settings-button settings-button-primary mt-3"
                      type="button"
                      disabled={busy}
                      onClick={() => void onToggleEnable()}
                    >
                      {t("Enable")}
                    </button>
                  )}
                </div>
              ) : !hasConnections && !hasDeclarativeSettings ? (
                <p className="plugin-detail-description">
                  {t("This plugin has no configurable settings.")}
                </p>
              ) : null}
            </div>
          )}

          {activeTab === "runtime" && (
            <div className="plugin-tab-runtime space-y-6">
              {/* Security & Sandbox Spec */}
              {isTheme ? (
                <section className="plugin-section-card">
                  <h2 className="plugin-section-title">
                    <Shield size={16} aria-hidden="true" />
                    <span>{t("Runtime & Security")}</span>
                  </h2>
                  <p className="plugin-detail-description">
                    {t(
                      "Theme packages contain validated colors, fonts, and layout tokens. They have no executable code, network access, or access to Space data."
                    )}
                  </p>
                </section>
              ) : (
                <section className="plugin-section-card">
                  <h2 className="plugin-section-title">
                    <Shield size={16} aria-hidden="true" />
                    <span>{t("Security & Sandbox")}</span>
                  </h2>
                  <div className="plugin-spec-grid">
                    <div className="plugin-spec-item">
                      <span className="plugin-spec-label">
                        {t("Execution")}
                      </span>
                      <span className="plugin-spec-value">
                        {t("Isolated iframe sandbox (null origin)")}
                      </span>
                    </div>
                    <div className="plugin-spec-item">
                      <span className="plugin-spec-label">
                        {t("CSP Policy")}
                      </span>
                      <span className="plugin-spec-value">
                        <code>sandbox="allow-scripts"</code>
                      </span>
                    </div>
                    <div className="plugin-spec-item">
                      <span className="plugin-spec-label">
                        {t("Network Access")}
                      </span>
                      <span className="plugin-spec-value">
                        {hasConnections ? (
                          <div className="space-y-1">
                            {Object.values(manifest?.connections ?? {}).map(
                              (connection) => (
                                <code
                                  key={connection.url}
                                  className="block break-all text-xs"
                                >
                                  {connection.url}
                                </code>
                              )
                            )}
                          </div>
                        ) : manifest?.browser?.networkOrigins?.length ? (
                          <div className="space-y-1">
                            {manifest.browser.networkOrigins.map((origin) => (
                              <code key={origin} className="block text-xs">
                                {origin}
                              </code>
                            ))}
                          </div>
                        ) : (
                          <span>
                            {t("No external network access (100% offline)")}
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="plugin-spec-item">
                      <span className="plugin-spec-label">
                        {t("Storage Quota")}
                      </span>
                      <span className="plugin-spec-value">
                        {manifest?.storage?.maxBytes
                          ? formatBytes(manifest.storage.maxBytes)
                          : t("Default sandbox quota")}
                      </span>
                    </div>
                    {manifest?.workspace?.files && (
                      <div className="plugin-spec-item">
                        <span className="plugin-spec-label">
                          {t("Space files")}
                        </span>
                        <span className="plugin-spec-value">
                          {manifest.workspace.files === true ||
                          (typeof manifest.workspace.files === "object" &&
                            manifest.workspace.files.write)
                            ? t("Can read and write files in this Space.")
                            : t("Can read files in this Space.")}
                        </span>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* Package Integrity */}
              {plugin?.hash && (
                <section className="plugin-section-card">
                  <h2 className="plugin-section-title">
                    <HardDrive size={16} aria-hidden="true" />
                    <span>{t("Integrity (SHA-256)")}</span>
                  </h2>
                  <div className="plugin-hash-box">
                    <code className="plugin-hash-text">{plugin.hash}</code>
                    <button
                      type="button"
                      className="plugin-copy-btn"
                      title={
                        copiedHash
                          ? t("Copied to clipboard")
                          : t("Integrity (SHA-256)")
                      }
                      onClick={() => copyText(plugin.hash, true)}
                    >
                      {copiedHash ? <Check size={13} /> : <Copy size={13} />}
                    </button>
                  </div>
                </section>
              )}

              {/* Development Source */}
              {plugin?.developmentPath && (
                <section className="plugin-section-card">
                  <h2 className="plugin-section-title">
                    <Code2 size={16} aria-hidden="true" />
                    <span>{t("Development")}</span>
                  </h2>
                  <p className="plugin-spec-value">
                    <code>{plugin.developmentPath}</code>
                  </p>
                </section>
              )}
            </div>
          )}

          {activeTab === "properties" && (
            <div className="plugin-tab-properties">{sidebarContent}</div>
          )}
        </main>

        {/* Right Column: Metadata Sidebar (desktop only) */}
        {!isMobile && (
          <aside className="plugin-detail-sidebar" aria-label={t("Properties")}>
            {sidebarContent}
          </aside>
        )}
      </div>

      {activeScreenshot && (
        <div
          className="plugin-screenshot-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={activeScreenshot.alt}
          onClick={(e) => {
            if (e.target === e.currentTarget) setActiveScreenshot(null)
          }}
        >
          <div className="plugin-screenshot-modal">
            <button
              type="button"
              className="plugin-screenshot-close"
              onClick={() => setActiveScreenshot(null)}
              aria-label={t("Close")}
            >
              <X size={18} aria-hidden="true" />
            </button>
            <img
              src={activeScreenshot.src}
              alt={activeScreenshot.alt}
              className="plugin-screenshot-modal-img"
            />
            {activeScreenshot.alt && (
              <p className="plugin-screenshot-modal-caption">
                {activeScreenshot.alt}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function PluginDeclarativeSettings({ manifest }: { manifest: PluginManifest }) {
  const { t } = useEidosLiteI18n()
  const [values, setValues] = useState<Record<string, SettingValue> | null>(
    null
  )
  const [error, setError] = useState("")
  useEffect(() => {
    let live = true
    void window.eidosLite
      .pluginSettings(manifest.id)
      .then((result) => {
        if (live) setValues(result)
      })
      .catch((cause) => {
        if (live) setError(String(cause))
      })
    return () => {
      live = false
    }
  }, [manifest.id])
  const save = async (key: string, value: SettingValue) => {
    setError("")
    try {
      await window.eidosLite.setPluginSetting(manifest.id, key, value)
      setValues((current) => (current ? { ...current, [key]: value } : current))
    } catch (cause) {
      setError(String(cause))
    }
  }
  if (!values)
    return error ? (
      <p role="alert">{error}</p>
    ) : (
      <p className="text-sm text-muted-foreground">{t("Loading settings…")}</p>
    )
  return (
    <section className="space-y-5" aria-label={t("Settings")}>
      {Object.entries(manifest.settings ?? {}).map(([key, declaration]) => {
        const value = values[key] ?? declaration.default
        return (
          <label key={key} className="block max-w-lg text-sm">
            <span className="font-medium">{declaration.title}</span>
            {declaration.description && (
              <span className="mt-1 block text-xs text-muted-foreground">
                {declaration.description}
              </span>
            )}
            {declaration.type === "boolean" ? (
              <input
                className="ml-3"
                type="checkbox"
                checked={value === true}
                onChange={(event) => void save(key, event.target.checked)}
              />
            ) : declaration.type === "string" && declaration.enum ? (
              <select
                className="mt-2 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={String(value)}
                onChange={(event) => void save(key, event.target.value)}
              >
                {declaration.enum.map((choice) => (
                  <option key={choice} value={choice}>
                    {choice}
                  </option>
                ))}
              </select>
            ) : (
              <input
                key={`${manifest.id}:${key}`}
                className="mt-2 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                type={declaration.type === "number" ? "number" : "text"}
                defaultValue={String(value)}
                min={
                  declaration.type === "number"
                    ? declaration.minimum
                    : undefined
                }
                max={
                  declaration.type === "number"
                    ? declaration.maximum
                    : undefined
                }
                onBlur={(event) => {
                  const next =
                    declaration.type === "number"
                      ? Number(event.target.value)
                      : event.target.value
                  if (next !== value) void save(key, next)
                }}
              />
            )}
          </label>
        )
      })}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  )
}
