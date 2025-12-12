import { useTabTitle } from "@/apps/web-app/hooks/use-tab-title"

import { HandlerRenderer } from "./components/handler-renderer"
import { LoadingState } from "./components/loading-state"
import { NoFilePathState } from "./components/no-file-path-state"
import { NoHandlerState } from "./components/no-handler-state"
import { useFilePathFromHash } from "./hooks/use-file-path-from-hash"
import { useHandlerSelection } from "./hooks/use-handler-selection"

export function FileHandlerPage() {
  const { filePath, fileExtension, fileName } = useFilePathFromHash()
  useTabTitle(fileName)
  const { handlers, selectedHandler, isLoadingHandlers, isLoadingDefault } =
    useHandlerSelection(fileExtension)

  // No file path
  if (!filePath) {
    return <NoFilePathState />
  }

  // No handlers available
  if (handlers.length === 0) {
    return <NoHandlerState fileExtension={fileExtension} fileName={fileName} />
  }

  // Render the selected handler
  if (selectedHandler) {
    return (
      <div className="h-screen flex flex-col">
        <div className="flex-1 overflow-hidden">
          <HandlerRenderer handlerId={selectedHandler.id} filePath={filePath} />
        </div>
      </div>
    )
  }

  // This should not happen, but handle it gracefully
  return <LoadingState />
}
