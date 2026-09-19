import {
  useCallback,
  useEffect,
  useId,
  useState,
  useRef,
  useMemo,
  type ReactNode,
} from "react"
import {
  Plus,
  Code2,
  Blocks,
  ArrowLeft,
  ChevronRight,
  LayoutGrid,
  List,
  Search,
  RotateCw,
} from "lucide-react"
import {
  type PluginEditorChoice,
  type PluginListing,
  type PluginMarketplace,
  type PluginInstallTask,
  isPluginUpdateAvailable,
} from "../shared/plugins"
import { useEidosLiteI18n } from "./i18n"
import { PluginPage } from "./plugin-workspace"
import { PluginIcon, getPluginIconBadgeStyle } from "./plugin-icon"
import { PluginMarketplaceView } from "./plugin-marketplace"
import { PluginDetailView } from "./plugin-detail-view"
import { isMarkdownTextFile } from "./text-editor-options"

type PluginTab = "enabled" | "installed" | "marketplace"
export function PluginManager({
  spaceAvailable = false,
  onOpenPage,
  variant = "page",
  builtins = [],
  selectedPluginId,
  onSelectPlugin,
  onPluginNameChange,
}: {
  spaceAvailable?: boolean
  onOpenPage?(key: string): void
  variant?: "page" | "settings"
  builtins?: {
    id: string
    name: string
    enabled: boolean
    details: ReactNode
  }[]
  selectedPluginId?: string | null
  onSelectPlugin?(id: string | null, name?: string | null): void
  onPluginNameChange?(name: string | null): void
}) {
  const { t } = useEidosLiteI18n()
  const buttonClass = variant === "settings" ? "settings-button" : undefined
  const id = useId()
  const [tab, setTab] = useState<PluginTab>(
    spaceAvailable ? "enabled" : "installed"
  )
  const [listing, setListing] = useState<PluginListing | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [internalSelected, setInternalSelected] = useState<string | null>(null)
  const selected =
    selectedPluginId !== undefined ? selectedPluginId : internalSelected
  const setSelected = useCallback(
    (nextId: string | null, name?: string | null) => {
      if (selectedPluginId === undefined) {
        setInternalSelected(nextId)
      }
      onSelectPlugin?.(nextId, name)
    },
    [selectedPluginId, onSelectPlugin]
  )
  const [layout, setLayout] = useState<"card" | "list">(() => {
    try {
      const saved = localStorage.getItem("eidos:plugin-layout")
      return saved === "list" || saved === "card" ? saved : "card"
    } catch {
      return "card"
    }
  })
  const updateLayout = (mode: "card" | "list") => {
    setLayout(mode)
    try {
      localStorage.setItem("eidos:plugin-layout", mode)
    } catch {}
  }
  const surface = useRef<HTMLDivElement>(null)
  const previousSelection = useRef<string | null>(null)
  useEffect(() => {
    if (selected) {
      surface.current?.querySelector<HTMLElement>("h1")?.focus()
    } else if (previousSelection.current) {
      Array.from(
        surface.current?.querySelectorAll<HTMLButtonElement>(
          "[data-plugin-id]"
        ) ?? []
      )
        .find((button) => button.dataset.pluginId === previousSelection.current)
        ?.focus()
    }
    previousSelection.current = selected
  }, [selected])
  const refresh = useCallback(async () => {
    if (window.eidosLite.listPlugins)
      setListing(await window.eidosLite.listPlugins())
  }, [])
  useEffect(() => {
    const update = () =>
      void refresh().catch((error) => setError(String(error)))
    update()
    return window.eidosLite.onPluginEvent?.(({ event }) => {
      if (event.observation === "host.catalog") update()
    })
  }, [refresh])
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      await refresh()
      window.dispatchEvent(new Event("eidos-plugins-changed"))
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }
  const [search, setSearch] = useState("")
  const [marketplace, setMarketplace] = useState<PluginMarketplace | null>(null)
  const [marketplaceLoading, setMarketplaceLoading] = useState(true)
  const [marketplaceError, setMarketplaceError] = useState("")
  const loadMarketplace = useCallback(async (refresh = false) => {
    setMarketplaceLoading(true)
    setMarketplaceError("")
    try {
      setMarketplace(await window.eidosLite.pluginMarketplace(refresh))
    } catch (error) {
      setMarketplaceError(String(error))
    } finally {
      setMarketplaceLoading(false)
    }
  }, [])
  useEffect(() => {
    void loadMarketplace()
  }, [loadMarketplace])

  const [installQueue, setInstallQueue] = useState<string[]>([])
  const [installTasks, setInstallTasks] = useState<
    Record<string, PluginInstallTask>
  >({})
  const [activeInstallId, setActiveInstallId] = useState<string | null>(null)

  useEffect(() => {
    return window.eidosLite.onPluginInstallProgress?.((progress) => {
      setInstallTasks((prev) => {
        const task = prev[progress.id]
        if (!task) return prev
        return {
          ...prev,
          [progress.id]: {
            ...task,
            status: progress.phase,
            percent: progress.percent ?? task.percent,
          },
        }
      })
    })
  }, [])

  const installMarketplacePlugin = useCallback((id: string) => {
    setInstallTasks((prev) => {
      if (prev[id]) return prev
      return {
        ...prev,
        [id]: { id, status: "queued", percent: 0 },
      }
    })
    setInstallQueue((prev) => {
      if (prev.includes(id)) return prev
      return [...prev, id]
    })
  }, [])

  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (activeInstallId !== null || installQueue.length === 0) return
    const nextId = installQueue[0]
    setActiveInstallId(nextId)
    setInstallTasks((prev) => {
      const existing = prev[nextId]
      if (!existing) return prev
      return {
        ...prev,
        [nextId]: { ...existing, status: "downloading", percent: 0 },
      }
    })

    void (async () => {
      try {
        await window.eidosLite.installMarketplacePlugin(nextId)
        if (mountedRef.current) {
          await refresh()
          window.dispatchEvent(new Event("eidos-plugins-changed"))
        }
      } catch (err) {
        if (mountedRef.current) {
          setError(err instanceof Error ? err.message : String(err))
        }
      } finally {
        if (mountedRef.current) {
          setInstallTasks((prev) => {
            const next = { ...prev }
            delete next[nextId]
            return next
          })
          setInstallQueue((prev) => prev.filter((item) => item !== nextId))
          setActiveInstallId(null)
        }
      }
    })()
  }, [activeInstallId, installQueue, refresh])

  const query = search.trim().toLowerCase()
  const matchesSearch = (
    itemId: string,
    itemName: string,
    itemDesc?: string
  ) => {
    if (!query) return true
    return (
      itemName.toLowerCase().includes(query) ||
      itemId.toLowerCase().includes(query) ||
      Boolean(itemDesc && itemDesc.toLowerCase().includes(query))
    )
  }

  const plugins = listing?.plugins ?? []
  const filteredPlugins = plugins.filter((item) => {
    const matched = marketplace?.plugins.find((p) => p.id === item.manifest.id)
    const desc =
      matched?.description ??
      (item.manifest as { description?: string })?.description
    return matchesSearch(item.manifest.id, item.manifest.name, desc)
  })

  const enabled = plugins.filter((plugin) => plugin.enabled)
  const filteredEnabled = filteredPlugins.filter((plugin) => plugin.enabled)
  const visible = tab === "enabled" ? filteredEnabled : filteredPlugins

  const filteredBuiltins = builtins.filter((item) =>
    matchesSearch(item.id, item.name)
  )

  const builtin = builtins.find((item) => item.id === selected)
  const plugin = plugins.find((item) => item.manifest.id === selected)

  const updatablePlugins = useMemo(() => {
    if (!listing?.plugins || !marketplace?.plugins) return []
    return listing.plugins.filter((p) => {
      const match = marketplace.plugins.find((m) => m.id === p.manifest.id)
      return match && isPluginUpdateAvailable(p.manifest.version, match.version)
    })
  }, [listing, marketplace])

  const handleUpdateAll = useCallback(() => {
    for (const p of updatablePlugins) {
      installMarketplacePlugin(p.manifest.id)
    }
  }, [updatablePlugins, installMarketplacePlugin])

  const tabs: {
    key: PluginTab
    label: string
    count?: number
    updateCount?: number
  }[] = [
    ...(spaceAvailable
      ? [
          {
            key: "enabled" as const,
            label: t("Enabled in this Space"),
            count: query ? filteredEnabled.length : enabled.length,
          },
        ]
      : []),
    {
      key: "installed",
      label: t("Installed"),
      count: query
        ? filteredPlugins.length + filteredBuiltins.length
        : plugins.length + builtins.length,
      updateCount: updatablePlugins.length,
    },
    { key: "marketplace", label: t("Marketplace") },
  ]

  const matchedMarketplacePlugin = marketplace?.plugins.find(
    (p) => p.id === (plugin?.manifest.id ?? selected)
  )
  const displayName =
    builtin?.name ??
    plugin?.manifest.name ??
    matchedMarketplacePlugin?.name ??
    selected

  useEffect(() => {
    onPluginNameChange?.(selected ? displayName : null)
  }, [selected, displayName, onPluginNameChange])

  if (selected && (builtin || plugin || matchedMarketplacePlugin)) {
    const manifest = plugin?.manifest
    return (
      <div ref={surface}>
        <PluginDetailView
          plugin={plugin}
          builtin={builtin}
          marketplacePlugin={matchedMarketplacePlugin}
          spaceAvailable={spaceAvailable}
          busy={busy}
          installTask={
            matchedMarketplacePlugin
              ? installTasks[matchedMarketplacePlugin.id]
              : undefined
          }
          installDisabled={Boolean(marketplace?.cached)}
          error={error}
          variant={variant}
          onBack={() => setSelected(null)}
          onOpenPage={onOpenPage}
          onInstall={() => {
            const id = plugin?.manifest.id ?? matchedMarketplacePlugin?.id
            if (!id) return
            installMarketplacePlugin(id)
          }}
          onToggleEnable={() => {
            if (!plugin || !manifest) return
            return run(() =>
              window.eidosLite.setPluginEnabled(manifest.id, !plugin.enabled)
            )
          }}
          onUninstall={() => {
            if (!plugin || !manifest) return
            return run(() => window.eidosLite.uninstallPlugin(manifest.id))
          }}
        />
      </div>
    )
  }
  return (
    <div
      ref={surface}
      className={`plugin-manager${variant === "settings" ? " plugin-manager-settings" : ""}`}
    >
      <header className="plugin-manager-heading">
        <div>
          <h1>{t("Plugins")}</h1>
          <p>
            {spaceAvailable
              ? t(
                  "Enable plugins for this Space. Install once, use across Spaces."
                )
              : t(
                  "Plugins are installed once for this device. Open a Space to enable and configure them."
                )}
          </p>
        </div>
        <div className="plugin-manager-actions">
          <button
            className={`settings-button ${buttonClass ?? ""}`.trim()}
            type="button"
            disabled={busy}
            onClick={() => void run(() => window.eidosLite.installPlugin(true))}
          >
            <Code2 size={13} aria-hidden="true" />
            <span>{t("Load development source…")}</span>
          </button>
          <button
            className={`settings-button settings-button-primary ${buttonClass ?? ""}`.trim()}
            type="button"
            disabled={busy}
            onClick={() => void run(() => window.eidosLite.installPlugin())}
          >
            <Plus size={13} aria-hidden="true" />
            <span>{t("Install plugin…")}</span>
          </button>
        </div>
      </header>
      <div className="plugin-manager-toolbar-row">
        <div
          className="plugin-manager-tabs"
          role="tablist"
          aria-label={t("Plugins")}
        >
          {tabs.map((item, index) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              id={`${id}-${item.key}`}
              aria-controls={`${id}-panel`}
              aria-selected={tab === item.key}
              tabIndex={tab === item.key ? 0 : -1}
              onClick={() => setTab(item.key)}
              onKeyDown={(event) => {
                let next = index
                if (event.key === "ArrowRight") next = (index + 1) % tabs.length
                else if (event.key === "ArrowLeft")
                  next = (index + tabs.length - 1) % tabs.length
                else if (event.key === "Home") next = 0
                else if (event.key === "End") next = tabs.length - 1
                else return
                event.preventDefault()
                setTab(tabs[next].key)
                event.currentTarget.parentElement
                  ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
                  [next]?.focus()
              }}
            >
              {item.label}
              {item.count !== undefined && listing && <span>{item.count}</span>}
              {item.updateCount !== undefined && item.updateCount > 0 && (
                <span
                  className="plugin-tab-update-badge"
                  title={t("Update available")}
                >
                  {item.updateCount}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="plugin-manager-toolbar-actions">
          <div className="plugin-search-box">
            <Search
              size={13}
              className="plugin-search-icon"
              aria-hidden="true"
            />
            <input
              type="search"
              aria-label={t("Search plugins")}
              placeholder={t("Search plugins")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setSearch("")
                  event.currentTarget.blur()
                }
              }}
              className="plugin-search-input"
            />
          </div>

          <div
            className="plugin-layout-toggle"
            role="group"
            aria-label={t("Layout")}
          >
            <button
              type="button"
              className={`plugin-layout-btn${layout === "card" ? " is-active" : ""}`}
              aria-pressed={layout === "card"}
              aria-label={t("Card view")}
              title={t("Card view")}
              onClick={() => updateLayout("card")}
            >
              <LayoutGrid size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={`plugin-layout-btn${layout === "list" ? " is-active" : ""}`}
              aria-pressed={layout === "list"}
              aria-label={t("List view")}
              title={t("List view")}
              onClick={() => updateLayout("list")}
            >
              <List size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
      {error && (
        <p className="plugin-manager-error" role="alert">
          {error}
        </p>
      )}
      <section
        id={`${id}-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-${tab}`}
        tabIndex={0}
      >
        {tab === "marketplace" ? (
          <PluginMarketplaceView
            listing={listing}
            busy={busy}
            catalog={marketplace}
            loading={marketplaceLoading}
            error={marketplaceError}
            refreshing={marketplaceLoading}
            onRefresh={() => void loadMarketplace(true)}
            installTasks={installTasks}
            onInstall={(id) => installMarketplacePlugin(id)}
            layout={layout}
            search={search}
            onSelectPlugin={(id, name) => setSelected(id, name)}
          />
        ) : (
          <>
            <div className="plugin-manager-tab-header">
              <p className="plugin-manager-caption">
                {tab === "enabled"
                  ? t("Only plugins enabled in this Space appear here.")
                  : t(
                      "Installed on this device. Enablement is managed separately in each Space."
                    )}
              </p>
              {tab === "installed" && updatablePlugins.length > 0 && (
                <button
                  className="settings-button settings-button-primary settings-button-compact plugin-update-all-btn"
                  type="button"
                  disabled={updatablePlugins.some(
                    (p) =>
                      installTasks[p.manifest.id]?.status === "downloading" ||
                      installTasks[p.manifest.id]?.status === "installing"
                  )}
                  onClick={handleUpdateAll}
                >
                  <RotateCw size={12} aria-hidden="true" />
                  <span>
                    {t("Update all")} ({updatablePlugins.length})
                  </span>
                </button>
              )}
            </div>
            {listing &&
              visible.length === 0 &&
              !(tab === "installed" && filteredBuiltins.length) && (
                <div className="plugin-manager-empty">
                  {query ? (
                    <>
                      <h2>{t("No plugins found")}</h2>
                      <p>{search ? `“${search}”` : null}</p>
                      <button
                        className="settings-button"
                        type="button"
                        onClick={() => setSearch("")}
                      >
                        {t("Clear search")}
                      </button>
                    </>
                  ) : (
                    <>
                      <h2>
                        {tab === "enabled"
                          ? t("No plugins enabled in this Space")
                          : t("No plugins installed")}
                      </h2>
                      <p>
                        {tab === "enabled"
                          ? t("Choose an installed plugin to enable it here.")
                          : t(
                              "Explore and install plugins from the Marketplace to get started."
                            )}
                      </p>
                      {tab === "enabled" ? (
                        <button
                          className="settings-button settings-button-primary"
                          type="button"
                          onClick={() => setTab("installed")}
                        >
                          {t("Browse installed plugins")}
                        </button>
                      ) : (
                        <button
                          className="settings-button settings-button-primary"
                          type="button"
                          onClick={() => setTab("marketplace")}
                        >
                          {t("Browse Marketplace")}
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            {layout === "card" ? (
              <div className="plugin-manager-grid">
                {tab === "installed" &&
                  filteredBuiltins.map((item) => (
                    <button
                      type="button"
                      className="plugin-card plugin-list-entry"
                      key={item.id}
                      data-plugin-id={item.id}
                      aria-label={item.name}
                      onClick={() => setSelected(item.id, item.name)}
                    >
                      <div className="plugin-card-header">
                        <div
                          className="plugin-card-icon-box"
                          style={getPluginIconBadgeStyle(item.id, item.name)}
                        >
                          <Blocks
                            className="plugin-manager-icon"
                            aria-hidden="true"
                          />
                        </div>
                        <div className="plugin-card-title-group">
                          <strong className="plugin-card-title">
                            {item.name}
                          </strong>
                          <span className="plugin-card-id">{item.id}</span>
                        </div>
                      </div>
                      <div className="plugin-card-footer">
                        <div className="plugin-card-badges">
                          <span className="plugin-pill-status is-builtin">
                            {t("Built-in")}
                          </span>
                          <span
                            className={`plugin-pill-status ${
                              item.enabled ? "is-enabled" : "is-disabled"
                            }`}
                          >
                            {item.enabled ? t("Enabled") : t("Disabled")}
                          </span>
                        </div>
                        <ChevronRight
                          className="plugin-card-chevron"
                          aria-hidden="true"
                        />
                      </div>
                    </button>
                  ))}
                {visible.map((plugin) => {
                  const matched = marketplace?.plugins.find(
                    (p) => p.id === plugin.manifest.id
                  )
                  const hasUpdate = Boolean(
                    matched &&
                    isPluginUpdateAvailable(
                      plugin.manifest.version,
                      matched.version
                    )
                  )
                  const desc = matched?.description
                  return (
                    <button
                      type="button"
                      onClick={() =>
                        setSelected(plugin.manifest.id, plugin.manifest.name)
                      }
                      aria-label={plugin.manifest.name}
                      className="plugin-card plugin-list-entry"
                      key={plugin.manifest.id}
                      data-plugin-id={plugin.manifest.id}
                    >
                      <div className="plugin-card-header">
                        <div
                          className="plugin-card-icon-box"
                          style={getPluginIconBadgeStyle(
                            plugin.manifest.id,
                            plugin.manifest.name,
                            plugin.manifest.icon
                          )}
                        >
                          <PluginIcon
                            icon={plugin.manifest.icon}
                            name={plugin.manifest.name}
                            id={plugin.manifest.id}
                            className="plugin-manager-icon"
                          />
                        </div>
                        <div className="plugin-card-title-group">
                          <strong className="plugin-card-title">
                            {plugin.manifest.name}
                          </strong>
                          <span className="plugin-card-id">
                            {plugin.manifest.id}
                          </span>
                        </div>
                      </div>
                      {desc ? <p className="plugin-card-desc">{desc}</p> : null}
                      <div className="plugin-card-footer">
                        <div className="plugin-card-badges">
                          <span className="plugin-pill-version">
                            v{plugin.manifest.version}
                          </span>
                          {hasUpdate ? (
                            <span className="plugin-pill-status is-update">
                              {t("Update available")}
                            </span>
                          ) : null}
                          {plugin.developmentPath ? (
                            <span className="plugin-pill-status is-dev">
                              {t("Development")}
                            </span>
                          ) : null}
                          {plugin.enabled ? (
                            <span className="plugin-pill-status is-enabled">
                              {t("Enabled in this Space")}
                            </span>
                          ) : null}
                        </div>
                        <ChevronRight
                          className="plugin-card-chevron"
                          aria-hidden="true"
                        />
                      </div>
                    </button>
                  )
                })}
              </div>
            ) : (
              <div
                className={`plugin-manager-list${variant === "settings" && (visible.length || (tab === "installed" && filteredBuiltins.length)) ? " settings-group" : ""}`}
              >
                {tab === "installed" &&
                  filteredBuiltins.map((item) => (
                    <button
                      type="button"
                      className={
                        variant === "settings"
                          ? "settings-row plugin-list-entry"
                          : "plugin-manager-row plugin-list-entry"
                      }
                      key={item.id}
                      data-plugin-id={item.id}
                      aria-label={item.name}
                      onClick={() => setSelected(item.id, item.name)}
                    >
                      <div
                        className="plugin-row-icon-box"
                        style={getPluginIconBadgeStyle(item.id, item.name)}
                      >
                        <Blocks
                          className="plugin-manager-icon"
                          aria-hidden="true"
                        />
                      </div>
                      <div
                        className={
                          variant === "settings"
                            ? "settings-row-copy plugin-manager-copy"
                            : "plugin-manager-copy"
                        }
                      >
                        <div className="plugin-row-title-line">
                          <strong>{item.name}</strong>
                          <span className="plugin-row-id">{item.id}</span>
                        </div>
                        <div className="plugin-row-meta-line">
                          <span className="plugin-pill-status is-builtin">
                            {t("Built-in")}
                          </span>
                          <span
                            className={`plugin-pill-status ${
                              item.enabled ? "is-enabled" : "is-disabled"
                            }`}
                          >
                            {item.enabled ? t("Enabled") : t("Disabled")}
                          </span>
                        </div>
                      </div>
                      <ChevronRight
                        className="plugin-row-chevron"
                        aria-hidden="true"
                      />
                    </button>
                  ))}
                {visible.map((plugin) => {
                  const matched = marketplace?.plugins.find(
                    (p) => p.id === plugin.manifest.id
                  )
                  const hasUpdate = Boolean(
                    matched &&
                    isPluginUpdateAvailable(
                      plugin.manifest.version,
                      matched.version
                    )
                  )
                  const desc = matched?.description
                  return (
                    <button
                      type="button"
                      onClick={() =>
                        setSelected(plugin.manifest.id, plugin.manifest.name)
                      }
                      aria-label={plugin.manifest.name}
                      className={
                        variant === "settings"
                          ? "settings-row plugin-list-entry"
                          : "plugin-manager-row plugin-list-entry"
                      }
                      key={plugin.manifest.id}
                      data-plugin-id={plugin.manifest.id}
                    >
                      <div
                        className="plugin-row-icon-box"
                        style={getPluginIconBadgeStyle(
                          plugin.manifest.id,
                          plugin.manifest.name,
                          plugin.manifest.icon
                        )}
                      >
                        <PluginIcon
                          icon={plugin.manifest.icon}
                          name={plugin.manifest.name}
                          id={plugin.manifest.id}
                          className="plugin-manager-icon"
                        />
                      </div>
                      <div
                        className={
                          variant === "settings"
                            ? "settings-row-copy plugin-manager-copy"
                            : "plugin-manager-copy"
                        }
                      >
                        <div className="plugin-row-title-line">
                          <strong>{plugin.manifest.name}</strong>
                          <span className="plugin-row-id">
                            {plugin.manifest.id}
                          </span>
                        </div>
                        <div className="plugin-row-meta-line">
                          <span className="plugin-pill-version">
                            v{plugin.manifest.version}
                          </span>
                          {hasUpdate ? (
                            <span className="plugin-pill-status is-update">
                              {t("Update available")}
                            </span>
                          ) : null}
                          {plugin.developmentPath ? (
                            <span className="plugin-pill-status is-dev">
                              {t("Development")}
                            </span>
                          ) : null}
                          {plugin.enabled ? (
                            <span className="plugin-pill-status is-enabled">
                              {t("Enabled in this Space")}
                            </span>
                          ) : null}
                          {desc ? (
                            <span className="plugin-row-desc">{desc}</span>
                          ) : null}
                        </div>
                      </div>
                      <ChevronRight
                        className="plugin-row-chevron"
                        aria-hidden="true"
                      />
                    </button>
                  )
                })}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}

export function PluginFileActions({
  relativePath,
  selected,
  onSelect,
  initialChoices,
}: {
  relativePath: string
  selected: string
  onSelect(editor: string): void
  initialChoices?: PluginEditorChoice[]
}) {
  const { t } = useEidosLiteI18n()
  const [choices, setChoices] = useState<PluginEditorChoice[]>(
    initialChoices ?? []
  )
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (initialChoices) {
      setChoices(initialChoices)
    }
  }, [initialChoices])

  useEffect(() => {
    let active = true
    const refresh = () => {
      void window.eidosLite
        .pluginEditors(relativePath)
        .then((value) => {
          if (active) setChoices(value)
        })
        .catch((error) => {
          if (active) setError(String(error))
        })
    }
    if (!initialChoices) {
      refresh()
    }
    const unsubscribe = window.eidosLite.onPluginEvent?.(({ event }) => {
      if (event.observation === "host.catalog") refresh()
    })
    window.addEventListener("eidos-plugins-changed", refresh)
    return () => {
      active = false
      unsubscribe?.()
      window.removeEventListener("eidos-plugins-changed", refresh)
    }
  }, [relativePath, initialChoices])

  if (choices.length === 0) {
    return error ? <span role="alert">{error}</span> : null
  }

  const isBuiltinText =
    isMarkdownTextFile(relativePath) || /\.html?$/iu.test(relativePath)

  const items: {
    key: string
    label: string
    icon?: PluginEditorChoice["icon"]
  }[] = isBuiltinText
    ? choices
    : [{ key: "builtin", label: t("Built-in editor") }, ...choices]

  return (
    <>
      {items.map((choice) => (
        <button
          type="button"
          role="menuitemradio"
          aria-checked={selected === choice.key}
          key={choice.key}
          onClick={() => onSelect(choice.key)}
        >
          {choice.key === "builtin" ? (
            <Code2 aria-hidden="true" />
          ) : (
            <PluginIcon
              icon={choice.icon}
              id={choice.key}
              name={choice.label}
              className="space-context-menu-icon"
            />
          )}
          {choice.label}
        </button>
      ))}
      {error && <span role="alert">{error}</span>}
    </>
  )
}
