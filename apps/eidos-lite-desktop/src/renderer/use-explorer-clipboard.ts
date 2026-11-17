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
  prepare?(
    paths: string[],
    mode: "cut" | "copy"
  ): Promise<SpacePathClipboardSources>
  isCurrent?(token: string): Promise<boolean>
  cancelPrepare?(): void
  onError(error: unknown): void
}) {
  const [stored, setStored] = useState<ExplorerClipboard | null>(null)
  const [preparing, setPreparing] = useState(false)
  const inFlight = useRef(false)
  const captureSequence = useRef(0)
  const checkingSequence = useRef(0)
  const [checking, setChecking] = useState(false)
  const pendingCapture = useRef(false)
  const currentOptions = useRef(options)
  currentOptions.current = options
  const scope = useRef(options.spaceId)
  scope.current = options.spaceId
  const clipboard = stored?.spaceId === options.spaceId ? stored : null
  useEffect(() => {
    const invalidate = () => {
      pendingCapture.current = false
      captureSequence.current += 1
      checkingSequence.current += 1
      currentOptions.current.cancelPrepare?.()
      setStored(null)
      setChecking(false)
      setPreparing(false)
    }
    const blur = () => {
      if (pendingCapture.current) invalidate()
    }
    const validate = async () => {
      const token = clipboard?.sources?.systemClipboardToken
      if (!token || !currentOptions.current.isCurrent) return
      const sequence = ++checkingSequence.current
      setChecking(true)
      let valid = false
      try {
        valid = await currentOptions.current.isCurrent(token)
      } catch {}
      if (sequence !== checkingSequence.current) return
      if (!valid) setStored((value) => (value === clipboard ? null : value))
      setChecking(false)
    }
    document.addEventListener("copy", invalidate)
    document.addEventListener("cut", invalidate)
    window.addEventListener("blur", blur)
    window.addEventListener("focus", validate)
    document.addEventListener("contextmenu", validate, true)
    return () => {
      checkingSequence.current += 1
      document.removeEventListener("copy", invalidate)
      document.removeEventListener("cut", invalidate)
      window.removeEventListener("blur", blur)
      window.removeEventListener("focus", validate)
      document.removeEventListener("contextmenu", validate, true)
    }
  }, [clipboard])
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
    !checking &&
    sourcesAvailable &&
    canPasteExplorerClipboard(clipboard, options.spaceId, target)
  return {
    clipboard,
    canCapture,
    canPaste,
    async capture(mode: "cut" | "copy", entries: SpaceTreeEntry[]) {
      if (!options.spaceId || !canCapture(entries)) return
      const sequence = ++captureSequence.current
      checkingSequence.current += 1
      setChecking(false)
      const selected = explorerClipboardEntries(entries)
      let sources: SpacePathClipboardSources | undefined
      setPreparing(true)
      pendingCapture.current = true
      try {
        sources = await options.prepare?.(
          selected.map((entry) => entry.relativePath),
          mode
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
        if (sequence === captureSequence.current) {
          pendingCapture.current = false
          setPreparing(false)
        }
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
      if (sources?.systemClipboardWarning)
        options.onError(new Error(sources.systemClipboardWarning))
    },
    async paste(target: string | null) {
      if (!clipboard || !canPaste(target)) return
      inFlight.current = true
      const sequence = captureSequence.current
      try {
        const token = clipboard.sources?.systemClipboardToken
        if (token && options.isCurrent && !(await options.isCurrent(token))) {
          setStored((current) => (current === clipboard ? null : current))
          return
        }
        if (
          scope.current !== clipboard.spaceId ||
          sequence !== captureSequence.current
        )
          return
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
