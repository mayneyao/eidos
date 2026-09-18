import {
  useState,
  useId,
  useEffect,
  useRef,
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
} from "lucide-react"
import type { PluginListing, MarketplacePlugin } from "../shared/plugins"
import { PluginIcon, getPluginIconBadgeStyle } from "./plugin-icon"
import { PluginPage } from "./plugin-workspace"
import { useEidosLiteI18n } from "./i18n"

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
  installing?: boolean
  installDisabled?: boolean
  error?: string | null
  onBack(): void
  onInstall?(): Promise<void> | void
  onToggleEnable(): Promise<void> | void
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
  installing = false,
  installDisabled = false,
  error = null,
  onBack,
  onInstall,
  onToggleEnable,
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

  const manifest = plugin?.manifest
  const marketplaceOnly = !plugin && !builtin && Boolean(marketplacePlugin)
  const pluginId = manifest?.id ?? builtin?.id ?? marketplacePlugin?.id ?? ""
  const pluginVersion =
    manifest?.version ?? marketplacePlugin?.version ?? "1.0.0"
  const pluginIcon = manifest?.icon ?? marketplacePlugin?.icon

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

  const settingsView = manifest?.placements?.find(
    (p) => p.location === "plugin/settings"
  )
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
      : [
          { key: "details", label: t("Details") },
          {
            key: "features",
            label: t("Features"),
            count: totalContributions > 0 ? totalContributions : undefined,
          },
          ...(settingsView
            ? [{ key: "settings" as const, label: t("Settings") }]
            : []),
          { key: "runtime", label: t("Runtime & Security") },
          ...(isMobile
            ? [{ key: "properties" as const, label: t("Properties") }]
            : []),
        ]

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
    setActiveTab(tabs[next].key)
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
            <dd>{pluginVersion}</dd>
          </div>
          <div className="plugin-prop-item">
            <dt>{t("API Version")}</dt>
            <dd>1.0</dd>
          </div>
          <div className="plugin-prop-item">
            <dt>{t("Type")}</dt>
            <dd>
              {builtin
                ? t("Built-in")
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

      {/* Security Summary */}
      <div className="plugin-sidebar-group">
        <h3 className="plugin-sidebar-heading">{t("Security & Sandbox")}</h3>
        <dl className="plugin-prop-list">
          <div className="plugin-prop-item">
            <dt>{t("Execution")}</dt>
            <dd>{t("Isolated iframe sandbox (null origin)")}</dd>
          </div>
          <div className="plugin-prop-item">
            <dt>{t("Network Access")}</dt>
            <dd>
              {manifest?.browser?.networkOrigins?.length ? (
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
              href={`https://github.com/${marketplacePlugin.repo}`}
              target="_blank"
              rel="noreferrer"
              className="plugin-resource-link"
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
              {builtin ? t("Built-in") : `v${pluginVersion}`}
            </span>
            <span className="plugin-detail-dot">·</span>
            {plugin ? (
              <span
                className={`plugin-status-pill ${
                  plugin.enabled ? "is-enabled" : "is-disabled"
                }`}
              >
                {plugin.enabled ? (
                  <>
                    <CheckCircle2
                      size={12}
                      className="status-icon"
                      aria-hidden="true"
                    />
                    <span>{t("Enabled in this Space")}</span>
                  </>
                ) : (
                  <>
                    <CircleSlash
                      size={12}
                      className="status-icon"
                      aria-hidden="true"
                    />
                    <span>{t("Disabled in this Space")}</span>
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
            {marketplaceOnly && (
              <button
                className={`settings-button settings-button-primary${
                  installing ? " is-installing" : ""
                }`}
                type="button"
                disabled={busy || installDisabled}
                aria-busy={installing || undefined}
                onClick={() => void onInstall?.()}
              >
                <Download size={12} aria-hidden="true" />
                <span>{t("Install…")}</span>
              </button>
            )}

            {plugin && manifest && (
              <>
                {spaceAvailable && (
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
                )}
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

            {settingsView && (
              <button
                type="button"
                className={`settings-button ${
                  activeTab === "settings"
                    ? "settings-button-active"
                    : "settings-button-quiet"
                }`}
                onClick={() => setActiveTab("settings")}
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
            onClick={() => setActiveTab(tabItem.key)}
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
              {builtin ? (
                <div className="plugin-builtin-content">{builtin.details}</div>
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
              {settingsView && plugin?.enabled && spaceAvailable ? (
                <div className="plugin-settings-surface">
                  <PluginPage
                    embedded
                    pageKey={`${manifest?.id}/${settingsView.view}`}
                    onClose={() => {}}
                    onNavigate={onOpenPage ?? (() => {})}
                  />
                </div>
              ) : settingsView && (!plugin?.enabled || !spaceAvailable) ? (
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
              ) : (
                <p className="plugin-detail-description">
                  {t("This plugin has no configurable settings.")}
                </p>
              )}
            </div>
          )}

          {activeTab === "runtime" && (
            <div className="plugin-tab-runtime space-y-6">
              {/* Security & Sandbox Spec */}
              <section className="plugin-section-card">
                <h2 className="plugin-section-title">
                  <Shield size={16} aria-hidden="true" />
                  <span>{t("Security & Sandbox")}</span>
                </h2>
                <div className="plugin-spec-grid">
                  <div className="plugin-spec-item">
                    <span className="plugin-spec-label">{t("Execution")}</span>
                    <span className="plugin-spec-value">
                      {t("Isolated iframe sandbox (null origin)")}
                    </span>
                  </div>
                  <div className="plugin-spec-item">
                    <span className="plugin-spec-label">{t("CSP Policy")}</span>
                    <span className="plugin-spec-value">
                      <code>sandbox="allow-scripts"</code>
                    </span>
                  </div>
                  <div className="plugin-spec-item">
                    <span className="plugin-spec-label">
                      {t("Network Access")}
                    </span>
                    <span className="plugin-spec-value">
                      {manifest?.browser?.networkOrigins?.length ? (
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
                </div>
              </section>

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
    </div>
  )
}
