import { RotateCw } from "lucide-react"
import type { PluginListing, PluginMarketplace } from "../shared/plugins"
import { PluginIcon, getPluginIconBadgeStyle } from "./plugin-icon"
import { useEidosLiteI18n } from "./i18n"

export function PluginMarketplaceView({
  listing,
  busy,
  catalog,
  loading,
  error,
  refreshing,
  onRefresh,
  installing,
  onInstall,
  layout = "card",
  search,
  onSelectPlugin,
}: {
  listing: PluginListing | null
  busy: boolean
  catalog: PluginMarketplace | null
  loading: boolean
  error: string
  refreshing: boolean
  onRefresh(): void
  installing: string | null
  onInstall(id: string): void
  layout?: "card" | "list"
  search?: string
  onSelectPlugin?(id: string, name?: string): void
}) {
  const { t } = useEidosLiteI18n()
  const query = (search ?? "").trim().toLowerCase()
  const plugins =
    catalog?.plugins.filter((p) => {
      if (!query) return true
      return (
        p.name.toLowerCase().includes(query) ||
        p.id.toLowerCase().includes(query) ||
        p.description.toLowerCase().includes(query)
      )
    }) ?? []
  const unavailable = !listing || Boolean(catalog?.cached)
  const installClass = (same: boolean, isInstalling: boolean) =>
    [
      "settings-button",
      same ? "" : "settings-button-primary",
      isInstalling ? "is-installing" : "",
    ]
      .filter(Boolean)
      .join(" ")
  return (
    <div>
      <div className="plugin-manager-tab-header">
        <p className="plugin-manager-caption">
          {catalog?.cached
            ? t("Showing a saved catalog. Connect to install plugins.")
            : t(
                "Plugins available to install on this device. Enablement is managed separately in each Space."
              )}
        </p>
        <button
          className="settings-button settings-button-quiet"
          type="button"
          disabled={refreshing}
          title={t("Refresh")}
          onClick={onRefresh}
        >
          <RotateCw
            size={12}
            className={refreshing ? "animate-spin" : undefined}
            aria-hidden="true"
          />
          <span>{t("Refresh")}</span>
        </button>
      </div>
      {loading && !catalog && <p role="status">{t("Loading plugins…")}</p>}
      {error && (
        <p role="alert" className="plugin-manager-error">
          {error}
        </p>
      )}
      {layout === "card" ? (
        <div className="plugin-manager-grid">
          {plugins.map((p) => {
            const installed = listing?.plugins.find(
              (item) => item.manifest.id === p.id
            )
            const same = installed?.hash === p.sha256
            const isInstalling = installing === p.id
            return (
              <div
                className="plugin-card plugin-marketplace-card"
                key={p.id}
                onClick={() => onSelectPlugin?.(p.id, p.name)}
                role={onSelectPlugin ? "button" : undefined}
                tabIndex={onSelectPlugin ? 0 : undefined}
                onKeyDown={
                  onSelectPlugin
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault()
                          onSelectPlugin(p.id, p.name)
                        }
                      }
                    : undefined
                }
              >
                <div className="plugin-card-header">
                  <div
                    className="plugin-card-icon-box"
                    style={getPluginIconBadgeStyle(p.id, p.name, p.icon)}
                  >
                    <PluginIcon
                      icon={p.icon}
                      id={p.id}
                      name={p.name}
                      className="plugin-card-icon"
                    />
                  </div>
                  <div className="plugin-card-title-group">
                    <strong className="plugin-card-title">{p.name}</strong>
                    <span className="plugin-card-id">{p.id}</span>
                  </div>
                </div>
                <p className="plugin-card-desc">{p.description}</p>
                <div className="plugin-card-footer">
                  <div className="plugin-card-badges">
                    <span className="plugin-pill-version">v{p.version}</span>
                    {p.preview ? (
                      <span className="plugin-pill-status is-dev">
                        {t("Preview")}
                      </span>
                    ) : null}
                  </div>
                  <button
                    className={installClass(same, isInstalling)}
                    disabled={busy || unavailable || same}
                    aria-busy={isInstalling || undefined}
                    onClick={(e) => {
                      e.stopPropagation()
                      onInstall(p.id)
                    }}
                  >
                    {t(
                      same
                        ? "Installed"
                        : installed
                          ? "Install listed version…"
                          : "Install…"
                    )}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="plugin-manager-list">
          {plugins.map((p) => {
            const installed = listing?.plugins.find(
              (item) => item.manifest.id === p.id
            )
            const same = installed?.hash === p.sha256
            const isInstalling = installing === p.id
            return (
              <div
                className="plugin-marketplace-row"
                key={p.id}
                onClick={() => onSelectPlugin?.(p.id, p.name)}
                role={onSelectPlugin ? "button" : undefined}
                tabIndex={onSelectPlugin ? 0 : undefined}
                onKeyDown={
                  onSelectPlugin
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault()
                          onSelectPlugin(p.id, p.name)
                        }
                      }
                    : undefined
                }
              >
                <div
                  className="plugin-row-icon-box"
                  style={getPluginIconBadgeStyle(p.id, p.name, p.icon)}
                >
                  <PluginIcon
                    icon={p.icon}
                    id={p.id}
                    name={p.name}
                    className="plugin-manager-icon"
                  />
                </div>
                <div className="plugin-marketplace-description">
                  <div className="plugin-row-title-line">
                    <strong>{p.name}</strong>
                    <span className="plugin-row-id">{p.id}</span>
                  </div>
                  <div className="plugin-row-meta-line">
                    <span className="plugin-pill-version">v{p.version}</span>
                    {p.preview ? (
                      <span className="plugin-pill-status is-dev">
                        {t("Preview")}
                      </span>
                    ) : null}
                    <span className="plugin-row-desc">{p.description}</span>
                  </div>
                  <small>
                    {p.repo} · {p.compatibility}
                  </small>
                </div>
                <button
                  className={installClass(same, isInstalling)}
                  disabled={busy || unavailable || same}
                  aria-busy={isInstalling || undefined}
                  onClick={(e) => {
                    e.stopPropagation()
                    onInstall(p.id)
                  }}
                >
                  {t(
                    same
                      ? "Installed"
                      : installed
                        ? "Install listed version…"
                        : "Install…"
                  )}
                </button>
              </div>
            )
          })}
        </div>
      )}
      {catalog && !loading && !plugins.length && (
        <div className="plugin-manager-empty">
          <p>{t("No plugins found")}</p>
        </div>
      )}
    </div>
  )
}
