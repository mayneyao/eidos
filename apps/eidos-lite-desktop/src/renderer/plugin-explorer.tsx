import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { ListTree, Check } from "lucide-react"
import type { ExplorerState } from "@eidos.space/plugin-sdk"
import type { PluginListing, PluginOpenResult } from "../shared/plugins"
import { PluginEditor } from "./plugin-editor"
import { useEidosLiteI18n } from "./i18n"

export function explorerChoices(listing: PluginListing | null) {
  return (listing?.plugins ?? [])
    .filter((p) => p.enabled && !p.unavailable)
    .flatMap((p) =>
      (p.manifest.placements ?? []).flatMap((placement) => {
        if (placement.location !== "sidebar/explorer") return []
        const view = p.manifest.views?.find(
          (view) => view.id === placement.view && view.kind === "page"
        )
        return view
          ? [
              {
                key: `${p.manifest.id}/${view.id}`,
                label: view.title,
                pluginName: p.manifest.name,
                hash: p.hash,
              },
            ]
          : []
      })
    )
}

export function usePluginExplorer(
  spaceId: string | undefined,
  state: ExplorerState
) {
  const [catalog, setCatalog] = useState<{
    spaceId: string
    listing: PluginListing
  } | null>(null)
  const [instance, setInstance] = useState<PluginOpenResult["instance"]>(null)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const stateRef = useRef(state)
  stateRef.current = state
  const spaceRef = useRef(spaceId)
  spaceRef.current = spaceId
  const refresh = useCallback(async () => {
    if (!spaceId || !window.eidosLite.listPlugins) return
    const listing = await window.eidosLite.listPlugins()
    if (spaceRef.current === spaceId) setCatalog({ spaceId, listing })
  }, [spaceId])
  useEffect(() => {
    let current = true
    const update = () => {
      if (!spaceId || !window.eidosLite.listPlugins) return
      void window.eidosLite
        .listPlugins()
        .then((listing) => {
          if (current) setCatalog({ spaceId, listing })
        })
        .catch((cause) => {
          if (current) setError(String(cause))
        })
    }
    update()
    const unsubscribe = window.eidosLite.onPluginEvent?.(({ event }) => {
      if (
        ["host.catalog", "host.reload", "host.rollback"].includes(
          event.observation
        )
      )
        update()
    })
    window.addEventListener("eidos-plugins-changed", update)
    return () => {
      current = false
      unsubscribe?.()
      window.removeEventListener("eidos-plugins-changed", update)
    }
  }, [spaceId])
  const listing =
    catalog && catalog.spaceId === spaceId ? catalog.listing : null
  const choices = explorerChoices(listing)
  const selected = choices.find((c) => c.key === listing?.space?.explorer)
  const key = selected?.key
  const hash = selected?.hash
  useEffect(() => {
    setInstance(null)
    setError(null)
    if (!key || !spaceId) return
    let current = true
    let ticket: string | undefined
    void window.eidosLite
      .openPluginExplorer(key, stateRef.current)
      .then((result) => {
        ticket = result.instance?.ticket
        if (!current) {
          if (ticket) void window.eidosLite.closePluginEditor(ticket)
          return
        }
        if (!result.instance) setError(result.warning ?? "Explorer unavailable")
        setInstance(result.instance)
      })
      .catch((cause) => {
        if (current) setError(String(cause))
      })
    return () => {
      current = false
      if (ticket) void window.eidosLite.closePluginEditor(ticket)
    }
  }, [spaceId, key, hash, retry])
  const select = async (key: string | null) => {
    try {
      await window.eidosLite.setPluginExplorer(key)
      await refresh()
      if (spaceRef.current === spaceId) setRetry((value) => value + 1)
    } catch (cause) {
      if (spaceRef.current === spaceId) setError(String(cause))
    }
  }
  return {
    choices,
    selected: key ?? null,
    loading: Boolean(spaceId) && !listing && !error,
    instance: listing && key ? instance : null,
    error,
    select,
    fail: setError,
    retry: () => setRetry((value) => value + 1),
  }
}

export function ExplorerPicker({
  choices,
  selected,
  onSelect,
  disabled = false,
}: {
  choices: ReturnType<typeof explorerChoices>
  selected: string | null
  onSelect(key: string | null): void
  disabled?: boolean
}) {
  const { t } = useEidosLiteI18n()
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !container.current?.contains(event.target)
      )
        setOpen(false)
    }
    document.addEventListener("pointerdown", outside, true)
    return () => document.removeEventListener("pointerdown", outside, true)
  }, [open])
  if (!choices.length) return null
  return (
    <div
      className="workspace-heading-menu"
      ref={container}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault()
          event.stopPropagation()
          setOpen(false)
          trigger.current?.focus({ preventScroll: true })
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="icon-button"
        title={t("Choose file explorer")}
        aria-label={t("Choose file explorer")}
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(!open)}
      >
        <ListTree size={14} />
      </button>
      {open && (
        <div
          className="workspace-heading-menu-content"
          role="group"
          aria-label={t("Choose file explorer")}
        >
          {[
            { key: null, label: t("Built-in explorer"), pluginName: "" },
            ...choices,
          ].map((choice) => (
            <button
              key={choice.key ?? "builtin"}
              type="button"
              aria-pressed={choice.key === selected}
              title={choice.pluginName}
              onClick={() => {
                onSelect(choice.key)
                setOpen(false)
                trigger.current?.focus({ preventScroll: true })
              }}
            >
              <Check
                aria-hidden="true"
                style={{
                  visibility: choice.key === selected ? "visible" : "hidden",
                }}
              />
              {choice.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function PluginExplorerPanel({
  explorer,
  state,
  onOpenFile,
  onNavigate,
  overlay,
  children,
}: {
  explorer: ReturnType<typeof usePluginExplorer>
  state: ExplorerState
  onOpenFile(path: string): void
  onNavigate?(key: string): void
  children: ReactNode
  overlay?: ReactNode
}) {
  const { t } = useEidosLiteI18n()
  const pending =
    explorer.loading ||
    Boolean(explorer.selected && !explorer.instance && !explorer.error)
  const [showPending, setShowPending] = useState(false)
  useEffect(() => {
    setShowPending(false)
    if (!pending) return
    const timer = setTimeout(() => setShowPending(true), 200)
    return () => clearTimeout(timer)
  }, [pending])
  return (
    <div className="plugin-explorer" id="workspace-files-panel">
      {explorer.error && (
        <div className="plugin-explorer-error" role="alert">
          <span>
            {t("Plugin explorer unavailable. Showing built-in explorer.")}
          </span>
          <button type="button" title={explorer.error} onClick={explorer.retry}>
            {t("Retry")}
          </button>
          <button type="button" onClick={() => void explorer.select(null)}>
            {t("Built-in explorer")}
          </button>
        </div>
      )}
      {overlay && <div className="plugin-explorer-overlay">{overlay}</div>}
      <div className="plugin-explorer-content" hidden={Boolean(overlay)}>
        {explorer.instance && !explorer.error ? (
          <PluginEditor
            key={explorer.instance.ticket}
            instance={explorer.instance}
            onDraft={() => {}}
            onFallback={() => void explorer.select(null)}
            onRetry={explorer.retry}
            onError={explorer.fail}
            onOpenFile={onOpenFile}
            onNavigate={onNavigate}
            hostEvent={{ observation: "host.explorer", value: state }}
          />
        ) : pending ? (
          showPending ? (
            <p className="explorer-busy" role="status">
              {t("Loading Space Explorer…")}
            </p>
          ) : null
        ) : (
          children
        )}
      </div>
    </div>
  )
}
