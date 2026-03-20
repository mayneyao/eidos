import { useMemo, useRef } from "react"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import { useDefaultHandler, useFileHandlers } from "@/hooks/use-file-handlers"

/**
 * Hook to manage file handler selection logic.
 *
 * Handler selection is computed **synchronously during render** (via useMemo)
 * instead of asynchronously (via useEffect+useState).  This avoids "stale frame"
 * bugs where the selection lags one render behind when `fileExtension` changes.
 *
 * A ref (`lastResolvedByExt`) remembers the last resolved handler per extension
 * so that:
 *   - Same-extension switching: the resolved handler is reused instantly (no
 *     loading flash, no re-selection).
 *   - Cross-extension switching: the handler is properly re-evaluated using the
 *     default handler for the new extension.
 */
export function useHandlerSelection(fileExtension: string) {
  const { searchParams } = useRouterAdapter()
  const handlerIdFromQuery = searchParams.get("handler")

  const { handlers, isLoading: isLoadingHandlers } =
    useFileHandlers(fileExtension)
  const { defaultHandlerId, isLoading: isLoadingDefault } =
    useDefaultHandler(fileExtension)

  // Remember resolved handler ID per extension so same-extension switching
  // reuses it without any loading flash.
  const lastResolvedByExt = useRef<Record<string, string>>({})

  // Derive selectedHandler synchronously — no useEffect, no useState, no lag.
  const selectedHandler = useMemo(() => {
    // Still loading data — cannot decide yet
    if (!fileExtension || isLoadingHandlers || isLoadingDefault) return null
    if (handlers.length === 0) return null

    // Priority 1: URL query parameter
    if (handlerIdFromQuery) {
      const h = handlers.find((h) => h.id === handlerIdFromQuery)
      if (h) {
        lastResolvedByExt.current[fileExtension] = h.id
        return h
      }
    }

    // Priority 2: Default handler for this extension
    if (defaultHandlerId) {
      const h = handlers.find((h) => h.id === defaultHandlerId)
      if (h) {
        lastResolvedByExt.current[fileExtension] = h.id
        return h
      }
    }

    // Priority 3: Previously resolved handler for the same extension
    // (handles same-ext switching — reuses the last known result)
    const lastId = lastResolvedByExt.current[fileExtension]
    if (lastId) {
      const h = handlers.find((h) => h.id === lastId)
      if (h) return h
    }

    // Priority 4: First available handler
    const first = handlers[0]
    lastResolvedByExt.current[fileExtension] = first.id
    return first
  }, [
    fileExtension,
    handlers,
    handlerIdFromQuery,
    defaultHandlerId,
    isLoadingHandlers,
    isLoadingDefault,
  ])

  return {
    handlers,
    selectedHandler,
    isLoadingHandlers,
    isLoadingDefault,
  }
}
