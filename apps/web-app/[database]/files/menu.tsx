import { useAIConfigStore } from "@/apps/web-app/settings/ai/store"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { useFileSystem } from "@/hooks/use-files"
import { useEidosFileSystemManager } from "@/hooks/use-fs"
import { useHnsw } from "@/hooks/use-hnsw"
import { useSqlite } from "@/hooks/use-sqlite"
import { useAppStore } from "@/lib/store/app-store"
import { useAppRuntimeStore } from "@/lib/store/runtime-store"

export function FileItemContextMenu({ children }: any) {
  const { selectedEntries, deleteFiles, getFileUrlPath } = useFileSystem()
  const { setCurrentPreviewFile } = useAppRuntimeStore()
  const { isSidebarOpen, setSidebarOpen } = useAppStore()
  const { createEmbedding } = useHnsw()
  const { aiConfig } = useAIConfigStore()
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

  const { efsManager } = useEidosFileSystemManager()

  const downloadFile = async () => {
    const path = "spaces" + getFileUrlPath(name)
    const file = await efsManager.getFileByPath(path)
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
    // TODO: use the embedding service
    // if (name.endsWith(".pdf")) {
    //   const path = "spaces" + getFileUrlPath(name)
    //   const file = await sqlite?.getFileByPath(path)
    //   if (file && !file.is_vectorized && aiConfig.token?.length) {
    //     await createEmbedding({
    //       id: file.id,
    //       type: "file",
    //       model: "text-embedding-ada-002",
    //       provider: new LLMOpenAI(new OpenAI({ apiKey: aiConfig.token })),
    //     })
    //   }
    // }
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
