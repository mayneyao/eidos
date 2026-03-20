import { useTabTitle } from "@/apps/web-app/hooks/use-tab-title"

import { HandlerRenderer } from "./components/handler-renderer"
import { LoadingState } from "./components/loading-state"
import { NoFolderPathState } from "./components/no-folder-path-state"
import { NoHandlerState } from "./components/no-handler-state"
import { useFolderPathFromHash } from "./hooks/use-folder-path-from-hash"
import { useHandlerSelection } from "./hooks/use-handler-selection"

export function FolderHandlerPage() {
  const { folderPath, folderName } = useFolderPathFromHash()
  useTabTitle(folderName || "Folder")
  const { handlers, selectedHandler, isLoadingHandlers, isLoadingDefault } =
    useHandlerSelection(folderPath)

  // No folder path
  if (!folderPath) {
    return <NoFolderPathState />
  }

  // No handlers available
  if (handlers.length === 0) {
    return <NoHandlerState folderPath={folderPath} folderName={folderName} />
  }

  // Render the selected handler
  if (selectedHandler) {
    return (
      <HandlerRenderer handlerId={selectedHandler.id} folderPath={folderPath} />
    )
  }

  // This should not happen, but handle it gracefully
  return <LoadingState />
}
