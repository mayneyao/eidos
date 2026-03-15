import { useEffect, useMemo, useState } from "react"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import type {
  FileHandlerMeta,
  IExtension,
} from "@/packages/core/types/IExtension"
import { useDefaultHandler, useFileHandlers } from "@/hooks/use-file-handlers"

/**
 * Hook to manage file handler selection logic
 * Automatically selects default handler if available, otherwise uses the first handler
 * Also supports handler ID from URL query parameter for immediate selection
 */
export function useHandlerSelection(fileExtension: string) {
  const { searchParams } = useRouterAdapter()
  const handlerIdFromQuery = searchParams.get("handler")

  const { handlers, isLoading: isLoadingHandlers } =
    useFileHandlers(fileExtension)
  const { defaultHandlerId, isLoading: isLoadingDefault } =
    useDefaultHandler(fileExtension)

  const [selectedHandlerId, setSelectedHandlerId] = useState<string | null>(
    null
  )

  // Create a stable handler ID list for dependency comparison
  const handlerIds = useMemo(() => handlers.map((h) => h.id), [handlers])

  // Determine which handler to use
  useEffect(() => {
    if (
      isLoadingHandlers ||
      isLoadingDefault ||
      !fileExtension ||
      handlers.length === 0
    ) {
      return
    }

    // Priority 1: Use handler from URL query parameter if specified
    if (handlerIdFromQuery) {
      const queryHandler = handlers.find((h) => h.id === handlerIdFromQuery)
      if (queryHandler) {
        setSelectedHandlerId(queryHandler.id)
        return
      }
    }

    // Priority 2: Use default handler if available
    if (defaultHandlerId) {
      const defaultHandler = handlers.find((h) => h.id === defaultHandlerId)
      if (defaultHandler) {
        setSelectedHandlerId(defaultHandler.id)
        return
      }
    }

    // Priority 3: Use the first handler
    setSelectedHandlerId(handlers[0].id)
  }, [
    // Use handlerIds (string array) instead of handlers (object array) to avoid reference issues
    handlerIds,
    defaultHandlerId,
    handlerIdFromQuery,
    isLoadingHandlers,
    isLoadingDefault,
    fileExtension,
    handlers,
  ])

  // Get the selected handler object from the ID
  const selectedHandler = useMemo(() => {
    if (!selectedHandlerId) return null
    return handlers.find((h) => h.id === selectedHandlerId) || null
  }, [selectedHandlerId, handlers])

  return {
    handlers,
    selectedHandler,
    isLoadingHandlers,
    isLoadingDefault,
  }
}
