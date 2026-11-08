import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
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
                icon: p.manifest.icon,
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
  const [selection, setSelection] = useState<{
    spaceId: string
    key: string | null
    request: number
  } | null>(null)
  const selectionRequest = useRef(0)
  const selectionQueue = useRef(Promise.resolve())
  const instanceOwner = useRef("")
  const [explicitSelection, setExplicitSelection] = useState<string | null>(
    null
  )
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
  const selectedKey =
    selection && selection.spaceId === spaceId
      ? selection.key
      : listing?.space?.explorer
  const selected = choices.find((c) => c.key === selectedKey)
  const key = selected?.key
  const hash = selected?.hash
  useEffect(() => {
    instanceOwner.current = ""
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
        instanceOwner.current = `${spaceId}/${key}/${hash}`
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
    if (!spaceId) return
    if (key && key === selected?.key && !error) {
      setExplicitSelection(spaceId)
      return
    }
    const request = ++selectionRequest.current
    setSelection({ spaceId, key, request })
    setExplicitSelection(spaceId)
    setError(null)
    if (key && key === selected?.key && error) setRetry((value) => value + 1)
    try {
      // Persist in click order; a slow earlier choice must not win a later click.
      const pending = selectionQueue.current
        .catch(() => {})
        .then(async () => {
          if (spaceRef.current === spaceId)
            await window.eidosLite.setPluginExplorer(key)
        })
      selectionQueue.current = pending
      await pending
      if (spaceRef.current !== spaceId || selectionRequest.current !== request)
        return
      await refresh()
      if (
        spaceRef.current === spaceId &&
        selectionRequest.current === request
      ) {
        setSelection(null)
      }
    } catch (cause) {
      if (
        spaceRef.current === spaceId &&
        selectionRequest.current === request
      ) {
        setSelection(null)
        setError(String(cause))
      }
    }
  }
  return {
    choices,
    selected: key ?? null,
    loading: Boolean(spaceId) && !listing && !error,
    explicitlySelected: Boolean(spaceId) && explicitSelection === spaceId,
    instance:
      listing && key && instanceOwner.current === `${spaceId}/${key}/${hash}`
        ? instance
        : null,
    error,
    select,
    fail: setError,
    retry: () => setRetry((value) => value + 1),
  }
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
  // Catalog/background initialization must never hide the usable local tree.
  const [interacted, setInteracted] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const keepCurrentTree = () => {
    if (!explorer.instance) setInteracted(true)
  }
  const showPlugin = Boolean(
    explorer.instance &&
    !explorer.error &&
    (!interacted || accepted || explorer.explicitlySelected)
  )
  return (
    <div
      className="plugin-explorer"
      id="workspace-files-panel"
      onPointerDownCapture={keepCurrentTree}
      onKeyDownCapture={keepCurrentTree}
      onWheelCapture={keepCurrentTree}
    >
      {explorer.instance && !explorer.error && !showPlugin ? (
        <button type="button" onClick={() => setAccepted(true)}>
          {t("Show saved explorer")}
        </button>
      ) : null}
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
        <div
          className="plugin-explorer-pane"
          data-active={!showPlugin}
          aria-hidden={showPlugin}
          {...(showPlugin ? { inert: "" } : {})}
        >
          {children}
        </div>
        {showPlugin && explorer.instance ? (
          <div className="plugin-explorer-pane" data-active="true">
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
          </div>
        ) : null}
      </div>
    </div>
  )
}
