import { useEffect, useRef, useState } from "react"
import type {
  SpaceTreeEntry,
  SpacePathClipboardSources,
} from "../shared/contracts"
import {
  canCaptureExplorerEntries,
  canPasteExplorerClipboard,
  explorerClipboardEntries,
  explorerClipboardSourceAvailable,
  type ExplorerClipboard,
} from "./explorer-clipboard"

export type ExplorerClipboardActions = ReturnType<typeof useExplorerClipboard>

export function useExplorerClipboard(options: {
  spaceId?: string
  entries?: SpaceTreeEntry[]
  disabled: boolean
  move(
    paths: string[],
    target: string | null,
    completed: (sources: string[]) => void,
    sources?: SpacePathClipboardSources
  ): Promise<void>
  copy(
    path: string,
    target: string | null,
    sources?: SpacePathClipboardSources
  ): Promise<{ refreshError?: string } | void>
  prepare?(paths: string[]): Promise<SpacePathClipboardSources>
  onError(error: unknown): void
}) {
  const [stored, setStored] = useState<ExplorerClipboard | null>(null)
  const [preparing, setPreparing] = useState(false)
  const inFlight = useRef(false)
  const captureSequence = useRef(0)
  const scope = useRef(options.spaceId)
  scope.current = options.spaceId
  const clipboard = stored?.spaceId === options.spaceId ? stored : null
  useEffect(() => {
    captureSequence.current += 1
    setStored(null)
    setPreparing(false)
  }, [options.spaceId])
  const canCapture = (entries: SpaceTreeEntry[]) =>
    !options.disabled && !inFlight.current && canCaptureExplorerEntries(entries)
  const currentEntries = options.entries
  const sourcesAvailable =
    !currentEntries ||
    Boolean(
      clipboard?.entries.every((entry) =>
        explorerClipboardSourceAvailable(currentEntries, entry.relativePath)
      )
    )
  const canPaste = (target: string | null) =>
    !options.disabled &&
    !inFlight.current &&
    !preparing &&
    sourcesAvailable &&
    canPasteExplorerClipboard(clipboard, options.spaceId, target)
  return {
    clipboard,
    canCapture,
    canPaste,
    async capture(mode: "cut" | "copy", entries: SpaceTreeEntry[]) {
      if (!options.spaceId || !canCapture(entries)) return
      const sequence = ++captureSequence.current
      const selected = explorerClipboardEntries(entries)
      let sources: SpacePathClipboardSources | undefined
      setPreparing(true)
      try {
        sources = await options.prepare?.(
          selected.map((entry) => entry.relativePath)
        )
        if (sources && sources.spaceId !== options.spaceId)
          throw new Error("The Space changed; select the source items again")
      } catch (cause) {
        if (
          scope.current === options.spaceId &&
          sequence === captureSequence.current
        )
          options.onError(cause)
        return
      } finally {
        if (sequence === captureSequence.current) setPreparing(false)
      }
      if (
        scope.current !== options.spaceId ||
        sequence !== captureSequence.current
      )
        return
      setStored({
        spaceId: options.spaceId,
        mode,
        entries: selected,
        sources,
      })
    },
    async paste(target: string | null) {
      if (!clipboard || !canPaste(target)) return
      inFlight.current = true
      try {
        if (clipboard.mode === "cut") {
          await options.move(
            clipboard.entries.map((entry) => entry.relativePath),
            target,
            (sources) => {
              setStored((current) =>
                current === clipboard
                  ? {
                      ...current,
                      entries: current.entries.filter(
                        (entry) => !sources.includes(entry.relativePath)
                      ),
                    }
                  : current
              )
            },
            clipboard.sources
          )
        } else {
          let completed = 0
          for (const entry of clipboard.entries) {
            if (scope.current !== clipboard.spaceId)
              throw new Error("The Space changed; paste was stopped")
            try {
              const result = await options.copy(
                entry.relativePath,
                target,
                clipboard.sources
              )
              completed += 1
              if (result?.refreshError)
                throw new Error(
                  `The files were copied, but the folder could not be refreshed. ${result.refreshError}`
                )
            } catch (cause) {
              throw new Error(
                `Copied ${completed} of ${clipboard.entries.length} items. ${cause instanceof Error ? cause.message : String(cause)}`
              )
            }
          }
        }
      } catch (cause) {
        options.onError(cause)
      } finally {
        inFlight.current = false
      }
    },
  }
}
