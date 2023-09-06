import { useAppRuntimeStore } from "@/lib/store/runtime-store"
import { useFileSystem } from "@/hooks/use-files"
import { useHnsw } from "@/hooks/use-hnsw"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { useConfigStore } from "@/app/settings/store"

import { useSpaceAppStore } from "../store"

export function FileManagerContextMenu({ children }: any) {
  const { addDir, backDir, isRootDir } = useFileSystem()

  const handleNewFolder = () => {
    addDir("folder")
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger className="h-full w-full">
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-64">
        <ContextMenuItem inset onSelect={handleNewFolder}>
          New folder
        </ContextMenuItem>
        <ContextMenuItem inset disabled={isRootDir} onSelect={backDir}>
          Back
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

export function FileItemContextMenu({ children }: any) {
  const { selectedEntries, deleteFiles, getFileUrlPath } = useFileSystem()
  const { setCurrentPreviewFileUrl } = useAppRuntimeStore()
  const { isSidebarOpen, setSidebarOpen } = useSpaceAppStore()
  const { createEmbedding } = useHnsw()
  const { aiConfig } = useConfigStore()

  const moreThenOneSelected = selectedEntries.size > 1
  const selectedEntry =
    selectedEntries.size === 1 ? selectedEntries.entries().next().value : null

  const handleRemove = () => {
    if (selectedEntry) {
      const [name, isDir] = selectedEntry
      deleteFiles([
        {
          name,
          isDir,
        },
      ])
    } else {
      const entries = Array.from(selectedEntries).map(([name, isDir]) => ({
        name,
        isDir,
      }))
      deleteFiles(entries)
    }
  }
  const openInNewTab = () => {
    const [name, isDir] = selectedEntry
    window.open(getFileUrlPath(name), "_blank")
  }

  const copyFileUrl = () => {
    const [name, isDir] = selectedEntry
    navigator.clipboard.writeText(window.location.origin + getFileUrlPath(name))
  }

  const previewFile = () => {
    const [name, isDir] = selectedEntry
    if (name.endsWith(".pdf")) {
      setSidebarOpen(false)
      setCurrentPreviewFileUrl(window.location.origin + getFileUrlPath(name))
    }
  }

  const handleCreateEmbedding = async () => {
    const [name, isDir] = selectedEntry
    if (name.endsWith(".pdf")) {
      const url = window.location.origin + getFileUrlPath(name)
      await createEmbedding({
        id: url,
        type: "file",
        model: "text-embedding-ada-002",
        provider: {
          name: "openai",
          token: aiConfig.token,
        },
      })
    }
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger className="h-full w-full">
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-64">
        <ContextMenuItem inset onSelect={openInNewTab}>
          Open in new tab
        </ContextMenuItem>
        <ContextMenuItem inset onSelect={previewFile}>
          Preview
        </ContextMenuItem>
        <ContextMenuItem inset onSelect={handleCreateEmbedding}>
          Create embedding
        </ContextMenuItem>
        <ContextMenuItem inset onSelect={copyFileUrl}>
          Copy Url
        </ContextMenuItem>
        <ContextMenuItem inset onSelect={handleRemove}>
          {moreThenOneSelected
            ? `Delete ${selectedEntries.size} files`
            : "Delete"}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
