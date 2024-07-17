import { useRef } from "react"
import { FileIcon } from "lucide-react"

import { getFileType } from "@/lib/mime/mime"
import { useFileSystem } from "@/hooks/use-files"

import { makeDataTransferData } from "./helper"

export const FileEntry = ({
  name,
  entry,
}: {
  name: string
  entry: FileSystemFileHandle
}) => {
  const { getFileUrlPath } = useFileSystem()
  const url = getFileUrlPath(name)
  const fileType = getFileType(url)
  const dragRef = useRef<HTMLDivElement>(null)
  const handleDragStart = async (event: React.DragEvent<HTMLDivElement>) => {
    event.dataTransfer.setData("text/plain", makeDataTransferData(url))
    const file = await entry.getFile()
    // event.dataTransfer.setData("file", file.name)
    event.dataTransfer.items.add(file)
    event.dataTransfer.effectAllowed = "move"
  }
  return (
    <div
      ref={dragRef}
      draggable={true}
      onDragStart={handleDragStart}
      className="flex cursor-pointer items-center justify-center rounded-sm p-2 hover:bg-secondary"
    >
      <div className="flex h-8 w-8 items-center justify-center">
        {fileType === "image" ? (
          <img src={url} alt={name} />
        ) : (
          <FileIcon className="mt-1 h-5 w-5" />
        )}
      </div>{" "}
      <p className="w-[220px] truncate pl-2  text-sm" title={name}>
        {name}
      </p>
    </div>
  )
}
