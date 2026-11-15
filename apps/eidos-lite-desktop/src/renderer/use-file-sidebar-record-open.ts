import { useCallback, useEffect, useRef, type KeyboardEvent } from "react"
import type {
  EidosFileRowQuery,
  EidosFileRow,
  EidosFileTableSnapshot,
} from "@eidos.space/eidos-file"
import type { EidosFileEditorDataSource } from "@eidos.space/eidos-file-ui"
import { fileMetadataRowPath } from "./file-metadata-actions"

/** Reuse the visible file preview without changing the main record route. */
export function useFileSidebarRecordOpen(options: {
  enabled: boolean
  source: Pick<EidosFileEditorDataSource, "getRow"> &
    Partial<Pick<EidosFileEditorDataSource, "getPage" | "getRecordNeighbors">>
  table: EidosFileTableSnapshot | null
  relativePath: string
  scope: string
  query?: EidosFileRowQuery
  onError?: (error: unknown) => void
  onOpenFile?: (path: string) => void | Promise<void>
  onInspectRecord?: (rowId: string) => void
  onRecordFocus?: (row: EidosFileRow) => void
}) {
  const enabled = Boolean(
    options.enabled &&
    options.table?.table.settings?.vtabModule === "fs_meta" &&
    options.source.getRow &&
    options.onOpenFile &&
    options.onInspectRecord
  )
  const latest = useRef({ ...options, enabled })
  latest.current = { ...options, enabled }
  const sequence = useRef(0)
  const navigationGeneration = useRef(0)
  const navigationQueue = useRef(Promise.resolve())
  const selected = useRef<{ scope: string; rowId: string } | null>(null)
  const selectionScope = `${options.relativePath}:${options.table?.table.id}:${options.scope}`
  const queryKey = JSON.stringify(options.query ?? {})
  useEffect(() => {
    sequence.current += 1
    navigationGeneration.current += 1
    navigationQueue.current = Promise.resolve()
  }, [
    enabled,
    options.source,
    options.table,
    options.relativePath,
    options.scope,
    queryKey,
  ])
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const rememberRecord = useCallback((rowId: string, row?: EidosFileRow) => {
    const context = latest.current
    navigationGeneration.current += 1
    navigationQueue.current = Promise.resolve()
    selected.current = {
      scope: `${context.relativePath}:${context.table?.table.id}:${context.scope}`,
      rowId,
    }
    if (row) context.onRecordFocus?.(row)
  }, [])
  const open = useCallback(async (rowId: string) => {
    const request = ++sequence.current
    const context = latest.current
    if (!context.enabled || !context.table) return
    const tableId = context.table.table.id
    const current = () =>
      mounted.current &&
      request === sequence.current &&
      latest.current.enabled &&
      latest.current.source === context.source &&
      latest.current.relativePath === context.relativePath &&
      latest.current.table?.table.id === tableId &&
      latest.current.scope === context.scope &&
      JSON.stringify(latest.current.query ?? {}) ===
        JSON.stringify(context.query ?? {})
    try {
      const row = await context.source.getRow!(tableId, rowId)
      if (!current()) return
      const path = row
        ? fileMetadataRowPath(context.table!, row, context.relativePath)
        : null
      if (path) {
        latest.current.onRecordFocus?.(row!)
        selected.current = {
          scope: `${context.relativePath}:${tableId}:${context.scope}`,
          rowId,
        }
        await latest.current.onOpenFile!(path)
        return
      }
    } catch {
      // The original inspector owns missing records and read failures too.
    }
    if (current()) latest.current.onInspectRecord?.(rowId)
  }, [])
  const openRecord = useCallback(
    (rowId: string) => {
      rememberRecord(rowId)
      void open(rowId)
    },
    [open, rememberRecord]
  )
  const onKeyDown = (
    event: KeyboardEvent<HTMLDivElement> | globalThis.KeyboardEvent
  ) => {
    const direction =
      event.key === "ArrowUp" || event.key === "ArrowLeft"
        ? "previousId"
        : event.key === "ArrowDown" || event.key === "ArrowRight"
          ? "nextId"
          : null
    const target = event.target
    if (
      !enabled ||
      !direction ||
      event.defaultPrevented ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      ("nativeEvent" in event
        ? event.nativeEvent.isComposing
        : event.isComposing) ||
      !(target instanceof Element) ||
      target.closest(
        'input, textarea, select, button:not([data-eidos-file-entry-cover]), a, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="menu"], [role="listbox"], [role="dialog"], .cm-editor, .eidos-file-detail-panel, [data-eidos-file-detail-panel]'
      ) ||
      !options.source.getRecordNeighbors ||
      !options.source.getPage
    )
      return
    event.preventDefault()
    event.stopPropagation()
    const generation = navigationGeneration.current
    const context = latest.current
    navigationQueue.current = navigationQueue.current
      .then(async () => {
        const current = () =>
          mounted.current &&
          latest.current.enabled &&
          generation === navigationGeneration.current
        if (!current() || !context.table) return
        const rowId =
          selected.current?.scope === selectionScope
            ? selected.current.rowId
            : null
        let nextId: string | null = null
        if (rowId) {
          const neighbors = await context.source.getRecordNeighbors!(
            context.table.table.id,
            rowId,
            context.query ?? {}
          )
          if (neighbors.found) nextId = neighbors[direction]
        } else {
          const page = await context.source.getPage!(
            context.table.table.id,
            0,
            1,
            context.query ?? {}
          )
          if (page.rows[0]?._id != null) nextId = String(page.rows[0]._id)
        }
        if (current() && nextId) await open(nextId)
      })
      .catch((error: unknown) => {
        if (generation === navigationGeneration.current && mounted.current)
          latest.current.onError?.(error)
      })
  }
  const keyDown = useRef(onKeyDown)
  keyDown.current = onKeyDown
  useEffect(() => {
    if (!enabled) return
    // Closing a menu can restore focus to body; clicking the sidebar's image
    // also leaves focus outside the record content's React key handler.
    const handle = (event: globalThis.KeyboardEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (
        target !== document.body &&
        target !== document.documentElement &&
        !target.closest(".file-sidebar")
      )
        return
      if (target.closest(".file-sidebar [data-eidos-file-workbench]")) return
      if (
        document.querySelector(
          '[aria-modal="true"], [role="dialog"][data-state="open"], dialog[open]'
        )
      )
        return
      keyDown.current(event)
    }
    window.addEventListener("keydown", handle, true)
    return () => window.removeEventListener("keydown", handle, true)
  }, [enabled])
  return {
    openRecord: enabled ? openRecord : undefined,
    rememberRecord,
    onKeyDown,
  }
}
