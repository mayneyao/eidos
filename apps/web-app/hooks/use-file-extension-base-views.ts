import { useCallback, useEffect, useState } from "react"

import { isDesktopMode } from "@/lib/env"

export type FileExtensionBaseView = Awaited<
  ReturnType<typeof window.eidos.fileExtensions.listBaseViews>
>[number]

export function useFileExtensionBaseViews(
  spaceId: string | undefined,
  filePath: string
) {
  const [baseViews, setBaseViews] = useState<FileExtensionBaseView[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)

  const reload = useCallback(() => setRevision((current) => current + 1), [])

  useEffect(() => {
    if (
      !spaceId ||
      !filePath ||
      !isDesktopMode ||
      !window.eidos?.fileExtensions?.listBaseViews
    ) {
      setBaseViews([])
      setLoading(false)
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    void window.eidos.fileExtensions
      .listBaseViews(spaceId, filePath)
      .then((next) => {
        if (cancelled) return
        setBaseViews(next)
        setError(null)
      })
      .catch((loadError: unknown) => {
        if (cancelled) return
        setBaseViews([])
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load extension Base views"
        )
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [filePath, revision, spaceId])

  useEffect(() => {
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
          reload()
        }
      }
    )
    return () => {
      if (listenerId) window.eidos.off("file-extensions:changed", listenerId)
    }
  }, [reload, spaceId])

  return { baseViews, loading, error, reload }
}
