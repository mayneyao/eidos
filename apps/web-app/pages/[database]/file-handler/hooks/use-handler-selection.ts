import { useEffect, useState } from "react"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import type { FileHandlerMeta, IExtension } from "@/packages/core/types/IExtension"
import {
  useDefaultHandler,
  useFileHandlers,
} from "@/hooks/use-file-handlers"

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
  const {
    defaultHandlerId,
    isLoading: isLoadingDefault,
  } = useDefaultHandler(fileExtension)

  const [selectedHandler, setSelectedHandler] =
    useState<IExtension<FileHandlerMeta> | null>(null)

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
        setSelectedHandler(queryHandler)
        return
      }
    }

    // Priority 2: Use default handler if available
    if (defaultHandlerId) {
      const defaultHandler = handlers.find((h) => h.id === defaultHandlerId)
      if (defaultHandler) {
        setSelectedHandler(defaultHandler)
        return
      }
    }

    // Priority 3: Use the first handler
    setSelectedHandler(handlers[0])
  }, [
    handlers,
    defaultHandlerId,
    handlerIdFromQuery,
    isLoadingHandlers,
    isLoadingDefault,
    fileExtension,
  ])

  return {
    handlers,
    selectedHandler,
    isLoadingHandlers,
    isLoadingDefault,
  }
}

