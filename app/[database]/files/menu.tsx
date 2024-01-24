
import { useConfigStore } from "@/app/settings/store"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { useFileSystem } from "@/hooks/use-files"
import { useHnsw } from "@/hooks/use-hnsw"
import { useSqlite } from "@/hooks/use-sqlite"
import { opfsManager } from "@/lib/opfs"
import { useAppRuntimeStore } from "@/lib/store/runtime-store"

import { useSpaceAppStore } from "../store"

export function FileItemContextMenu({ children }: any) {
  const { selectedEntries, deleteFiles, getFileUrlPath } = useFileSystem()
  const { setCurrentPreviewFile } = useAppRuntimeStore()
  const { isSidebarOpen, setSidebarOpen } = useSpaceAppStore()
  const { createEmbedding } = useHnsw()
  const { aiConfig } = useConfigStore()
  const { sqlite } = useSqlite()

  const moreThenOneSelected = selectedEntries.size > 1
  const selectedEntry =
    selectedEntries.size === 1 ? selectedEntries.entries().next().value : null

  const isPdf = selectedEntry && selectedEntry[0].endsWith(".pdf")
  const [name, isDir] = selectedEntry || [null, null]
  const handleRemove = () => {
    if (selectedEntry) {
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
    window.open(getFileUrlPath(name), "_blank")
  }

  const copyFileUrl = () => {
    navigator.clipboard.writeText(window.location.origin + getFileUrlPath(name))
  }

  const previewFile = async () => {
    const path = "spaces" + getFileUrlPath(name)
    console.log(path)
    const file = await sqlite?.getFileByPath(path)
    console.log(file)
    if (!file) {
      return
    }
    if (name.endsWith(".pdf")) {
      setSidebarOpen(false)
      setCurrentPreviewFile(file)
    }
  }

  const downloadFile = async () => {
    const path = "spaces" + getFileUrlPath(name)
    const file = await opfsManager.getFileByPath(path)
    try {
      // Show the file save dialog.
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: file.name,
      })
      // Write the blob to the file.
      const writable = await handle.createWritable()
      await writable.write(file)
      await writable.close()
      return
    } catch (err: any) {
      // Fail silently if the user has simply canceled the dialog.
      if (err.name !== "AbortError") {
        console.error(err.name, err.message)
        return
      }
    }
  }

  const handleCreateEmbedding = async () => {
    if (name.endsWith(".pdf")) {
      const path = "spaces" + getFileUrlPath(name)
      const file = await sqlite?.getFileByPath(path)
      if (file && !file.is_vectorized) {
        await createEmbedding({
          id: file.id,
          type: "file",
          model: "text-embedding-ada-002",
          provider: {
            name: "openai",
            token: aiConfig.token,
          },
        })
      }
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
        <ContextMenuItem inset onSelect={downloadFile}>
          Download
        </ContextMenuItem>
        {isPdf && (
          <ContextMenuItem inset onSelect={handleCreateEmbedding}>
            Create embedding
          </ContextMenuItem>
        )}
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
