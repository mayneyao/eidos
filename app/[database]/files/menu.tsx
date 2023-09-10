import { MouseEventHandler, useRef, useState } from "react"

import { useAppRuntimeStore } from "@/lib/store/runtime-store"
import { useFileSystem } from "@/hooks/use-files"
import { useHnsw } from "@/hooks/use-hnsw"
import { useSqlite } from "@/hooks/use-sqlite"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useConfigStore } from "@/app/settings/store"

import { useSpaceAppStore } from "../store"

export function FileManagerContextMenu({ children }: any) {
  const { addDir, backDir, isRootDir } = useFileSystem()
  const [newName, setNewName] = useState("folder")
  const [renameOpen, setRenameOpen] = useState(false)
  const renameInputRef = useRef<HTMLInputElement>(null)

  // for now opfs is not supporting rename dir, so just create new dir with given name
  const handleRename: MouseEventHandler<HTMLDivElement> = (e) => {
    setRenameOpen(true)
    setTimeout(() => {
      renameInputRef.current?.focus()
    }, 300)
    e.stopPropagation()
  }

  const handleRenameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      addDir(newName)
      // set to default
      setNewName("folder")
      setRenameOpen(false)
    }
    if (e.key === "Escape") {
      setRenameOpen(false)
    }
  }

  return (
    <ContextMenu>
      <Popover open={renameOpen}>
        <ContextMenuTrigger className="h-full w-full">
          <div>
            {children}
            <PopoverTrigger>
              <span />
            </PopoverTrigger>
          </div>
        </ContextMenuTrigger>
        <PopoverContent className="p-0">
          <Input
            ref={renameInputRef}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={handleRenameKeyDown}
            autoFocus
          />
        </PopoverContent>
      </Popover>
      <ContextMenuContent className="w-64">
        <ContextMenuItem inset onSelect={(e: any) => handleRename(e)}>
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

  const handleCreateEmbedding = async () => {
    if (name.endsWith(".pdf")) {
      const path = "spaces" + getFileUrlPath(name)
      const file = await sqlite?.getFileByPath(path)
      if (file && !file.isVectorized) {
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
