import { useEffect, useState } from "react"
import type { FileHandlerMeta, IExtension } from "@/packages/core/types/IExtension"
import {
  useDefaultHandler,
  useFileHandlers,
} from "@/hooks/use-file-handlers"

/**
 * Hook to manage file handler selection logic
 * Automatically selects default handler if available, otherwise uses the first handler
 */
export function useHandlerSelection(fileExtension: string) {
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

    // If we have a default handler, use it
    if (defaultHandlerId) {
      const defaultHandler = handlers.find((h) => h.id === defaultHandlerId)
      if (defaultHandler) {
        setSelectedHandler(defaultHandler)
        return
      }
    }

    // Otherwise, use the first handler
    setSelectedHandler(handlers[0])
  }, [
    handlers,
    defaultHandlerId,
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

