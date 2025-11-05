import { useEffect, useMemo, useState } from "react"
import type {
  FileHandlerMeta,
  IExtension,
} from "@/packages/core/types/IExtension"
import { AlertCircleIcon, ArrowLeftIcon } from "lucide-react"
import { useLocation, useNavigate } from "react-router-dom"

import {
  getFileExtension,
  useDefaultHandler,
  useFileHandlers,
} from "@/hooks/use-file-handlers"
import { Button } from "@/components/ui/button"

import { HandlerRenderer } from "./handler-renderer"
import { HandlerSelector } from "./handler-selector"

export function FileHandlerPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [selectedHandler, setSelectedHandler] =
    useState<IExtension<FileHandlerMeta> | null>(null)
  const [showSelector, setShowSelector] = useState(false)

  // Extract file path from URL hash
  const filePath = useMemo(() => {
    const hash = location.hash
    return hash.startsWith("#") ? hash.substring(1) : hash
  }, [location.hash])

  // Get file extension
  const fileExtension = useMemo(() => getFileExtension(filePath), [filePath])
  const fileName = useMemo(() => {
    const parts = filePath.split("/")
    return parts[parts.length - 1] || ""
  }, [filePath])

  // Query available handlers
  const { handlers, isLoading: isLoadingHandlers } =
    useFileHandlers(fileExtension)

  // Get default handler
  const {
    defaultHandlerId,
    isLoading: isLoadingDefault,
    setDefaultHandler,
  } = useDefaultHandler(fileExtension)

  console.log("filePath", filePath)
  // Determine which handler to use
  useEffect(() => {
    if (
      isLoadingHandlers ||
      isLoadingDefault ||
      !filePath ||
      handlers.length === 0
    ) {
      return
    }

    // If only one handler, use it directly
    if (handlers.length === 1) {
      setSelectedHandler(handlers[0])
      return
    }

    // If multiple handlers and we have a default, use it
    if (defaultHandlerId) {
      const defaultHandler = handlers.find((h) => h.id === defaultHandlerId)
      if (defaultHandler) {
        setSelectedHandler(defaultHandler)
        return
      }
    }

    // If multiple handlers and no default, show selector
    setShowSelector(true)
  }, [
    handlers,
    defaultHandlerId,
    isLoadingHandlers,
    isLoadingDefault,
    filePath,
  ])

  const handleHandlerSelect = async (handlerId: string, remember: boolean) => {
    const handler = handlers.find((h) => h.id === handlerId)
    if (!handler) return

    if (remember) {
      await setDefaultHandler(handlerId)
    }

    setSelectedHandler(handler)
    setShowSelector(false)
  }

  const handleBack = () => {
    navigate(-1)
  }

  const handleChangeHandler = () => {
    setSelectedHandler(null)
    setShowSelector(true)
  }

  // Loading state
  if (isLoadingHandlers || isLoadingDefault) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent motion-reduce:animate-[spin_1.5s_linear_infinite]" />
          <p className="mt-4 text-muted-foreground">Loading file handlers...</p>
        </div>
      </div>
    )
  }

  // No file path
  if (!filePath) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center max-w-md">
          <AlertCircleIcon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">No File Specified</h2>
          <p className="text-muted-foreground mb-4">
            Please provide a file path in the URL hash (e.g., #~/readme.md)
          </p>
          <Button onClick={handleBack}>
            <ArrowLeftIcon className="h-4 w-4 mr-2" />
            Go Back
          </Button>
        </div>
      </div>
    )
  }

  // No handlers available
  if (handlers.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center max-w-md">
          <AlertCircleIcon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">No Handler Available</h2>
          <p className="text-muted-foreground mb-2">
            No file handler is installed for{" "}
            <span className="font-mono">{fileExtension}</span> files.
          </p>
          <p className="text-sm text-muted-foreground mb-4">File: {fileName}</p>
          <Button onClick={handleBack}>
            <ArrowLeftIcon className="h-4 w-4 mr-2" />
            Go Back
          </Button>
        </div>
      </div>
    )
  }

  // Render the selected handler
  if (selectedHandler) {
    return (
      <div className="h-screen flex flex-col">
        <div className="flex-1 overflow-hidden">
          <HandlerRenderer handler={selectedHandler} filePath={filePath} />
        </div>
      </div>
    )
  }

  // Show selector
  return (
    <>
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">
            Select a handler to open this file...
          </p>
        </div>
      </div>
      <HandlerSelector
        open={showSelector}
        onClose={() => {
          setShowSelector(false)
          navigate(-1)
        }}
        handlers={handlers}
        fileExtension={fileExtension}
        fileName={fileName}
        onSelect={handleHandlerSelect}
      />
    </>
  )
}
