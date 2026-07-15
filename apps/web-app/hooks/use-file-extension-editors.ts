import { useCallback, useEffect, useRef, useState } from "react"

import { isDesktopMode } from "@/lib/env"

export type FileExtensionEditor = Awaited<
  ReturnType<typeof window.eidos.fileExtensions.listFileEditors>
>[number]

const MAX_CACHED_PATHS = 128

interface FileExtensionEditorOptions {
  onLoadError?: (filePath: string, error: unknown) => void
}

export function useFileExtensionEditors(
  spaceId?: string,
  { onLoadError }: FileExtensionEditorOptions = {}
) {
  const [editorsByPath, setEditorsByPath] = useState<
    Map<string, FileExtensionEditor[]>
  >(new Map())
  const cache = useRef(new Map<string, FileExtensionEditor[]>())
  const inFlight = useRef(new Map<string, Promise<FileExtensionEditor[]>>())
  const cacheGeneration = useRef(0)

  const clear = useCallback(() => {
    cacheGeneration.current += 1
    cache.current.clear()
    inFlight.current.clear()
    setEditorsByPath(new Map())
  }, [])

  const load = useCallback(
    (filePath: string): Promise<FileExtensionEditor[]> => {
      if (
        !spaceId ||
        !filePath ||
        !isDesktopMode ||
        !window.eidos?.fileExtensions?.listFileEditors
      ) {
        return Promise.resolve([])
      }
      const cached = cache.current.get(filePath)
      if (cached) return Promise.resolve(cached)
      const pending = inFlight.current.get(filePath)
      if (pending) return pending
      const generation = cacheGeneration.current
      const request = window.eidos.fileExtensions
        .listFileEditors(spaceId, filePath)
        .then((editors) => {
          if (generation !== cacheGeneration.current) return []
          const next = new Map(cache.current)
          next.delete(filePath)
          next.set(filePath, editors)
          while (next.size > MAX_CACHED_PATHS) {
            const oldest = next.keys().next().value
            if (typeof oldest !== "string") break
            next.delete(oldest)
          }
          cache.current = next
          setEditorsByPath(next)
          return editors
        })
        .catch((error: unknown) => {
          if (generation === cacheGeneration.current) {
            onLoadError?.(filePath, error)
          }
          return []
        })
        .finally(() => {
          if (inFlight.current.get(filePath) === request) {
            inFlight.current.delete(filePath)
          }
        })
      inFlight.current.set(filePath, request)
      return request
    },
    [onLoadError, spaceId]
  )

  useEffect(() => {
    clear()
    if (!spaceId || !isDesktopMode || !window.eidos) return
    const listenerId = window.eidos.on(
      "file-extensions:changed",
      (_event: unknown, payload: unknown) => {
        if (
          payload &&
          typeof payload === "object" &&
          "spaceId" in payload &&
          payload.spaceId === spaceId
        ) {
          clear()
        }
      }
    )
    return () => {
      if (listenerId) window.eidos.off("file-extensions:changed", listenerId)
    }
  }, [clear, spaceId])

  const editorsFor = useCallback(
    (filePath: string) => editorsByPath.get(filePath) ?? [],
    [editorsByPath]
  )

  return { editorsFor, load, clear }
}
