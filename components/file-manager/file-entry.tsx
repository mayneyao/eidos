import {
  FileAudioIcon,
  FileIcon,
  FileVideoIcon,
  FolderIcon,
  MoreHorizontalIcon,
} from "lucide-react"
import { useRef } from "react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useEidosFileSystemManager } from "@/hooks/use-fs"
import { getFileType } from "@/lib/mime/mime"

import { Button } from "../ui/button"
import { useToast } from "../ui/use-toast"
import { makeDataTransferData } from "./helper"
import { useRootDirStore } from "./hooks/store"
import { useFileOp } from "./hooks/use-file-manager"

export const FileEntry = ({
  name,
  entry,
}: {
  name: string
  entry: FileSystemHandle
}) => {
  const { getFileUrlPath, enterDir } = useFileOp()

  const { efsManager } = useEidosFileSystemManager()
  const { currentDir, setCurrentDir } = useRootDirStore()
  const isFile = entry.kind === "file"
  const url = getFileUrlPath(name)
  const fileType = getFileType(url)
  const dragRef = useRef<HTMLDivElement>(null)
  const handleDragStart = async (event: React.DragEvent<HTMLDivElement>) => {
    if (!isFile) return
    event.dataTransfer.setData("text/plain", makeDataTransferData(url))
    const file = await (entry as FileSystemFileHandle).getFile()
    // event.dataTransfer.setData("file", file.name)
    event.dataTransfer.items.add(file)
    event.dataTransfer.effectAllowed = "move"
  }
  const { toast } = useToast()

  const openInNewTab = () => {
    window.open(url, "_blank")
  }

  const copyFileUrl = () => {
    navigator.clipboard.writeText(window.location.origin + url)
    toast({
      title: "Copied",
      description: "File URL copied to clipboard",
    })
  }

  const downloadFile = async () => {
    const path = "spaces" + getFileUrlPath(name)
    const file = await efsManager.getFileByPath(path)
    try {
      // Show the file save dialog.
      const handle = await window.showSaveFilePicker({
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

  const Icon = () => {
    if (entry.kind === "directory") {
      return <FolderIcon className="h-5 w-5" />
    }
    if (fileType === "image") {
      return <img src={url} alt={name} />
    }
    if (fileType === "audio") {
      return <FileAudioIcon className="h-5 w-5" />
    }
    if (fileType === "video") {
      return <FileVideoIcon className="h-5 w-5" />
    }
    return <FileIcon className="h-5 w-5" />
  }

  const handleDoubleClick = () => {
    if (entry.kind === "directory") {
      setCurrentDir(entry as FileSystemDirectoryHandle)
      enterDir(entry.name)
    }
  }
  return (
    <div
      ref={dragRef}
      draggable={true}
      onDragStart={handleDragStart}
      className="group flex w-full cursor-pointer items-center justify-start rounded-sm  p-2 hover:bg-secondary"
      onDoubleClick={handleDoubleClick}
    >
      <div className="flex h-6 w-6 items-center justify-start">
        <Icon />
      </div>
      <p className="w-[220px] truncate pl-2  font-mono  text-sm" title={name}>
        {name}
      </p>
      {isFile && (
        <DropdownMenu>
          <DropdownMenuTrigger
            className="opacity-0 group-hover:opacity-100"
            asChild
          >
            <Button size="xs" variant="ghost">
              <MoreHorizontalIcon className="h-5 w-5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={openInNewTab}>Open</DropdownMenuItem>
            <DropdownMenuItem onClick={copyFileUrl}>Copy Url</DropdownMenuItem>
            <DropdownMenuItem onClick={downloadFile}>Download</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
