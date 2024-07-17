import { useRef, useState } from "react"
import { useDrop } from "ahooks"
import { ArrowLeftIcon, FolderIcon } from "lucide-react"

import { useAppStore } from "@/lib/store/app-store"
import { useFileSystem } from "@/hooks/use-files"
import { Separator } from "@/components/ui/separator"

import { EntrySelector } from "./entry-selector"
import { FileEntry } from "./file-entry"

export const FileManager = () => {
  const {
    entries,
    addFiles,
    enterDir,
    currentPath,
    enterPathByIndex,
    goRootDir,
    addSelectedEntry,
    removeSelectedEntry,
    prevSelectedEntries,
    setSelectedEntries,
    setPrevSelectedEntries,
  } = useFileSystem()
  const [isHovering, setIsHovering] = useState(false)
  const dropRef = useRef(null)
  const { selectedEntries, deleteFiles, getFileUrlPath } = useFileSystem()

  const { setFileManagerOpen } = useAppStore()
  const backToSidebar = () => {
    setFileManagerOpen(false)
  }
  useDrop(dropRef, {
    onFiles: (files, e) => {
      // when drop files into opfs via file manager, we don't use uuid as file name, keep the original name
      addFiles(files, false)
    },
    onDom: (content: string, e) => {
      alert(`custom: ${content} dropped`)
    },
    onDragEnter: () => setIsHovering(true),
    onDragLeave: () => setIsHovering(false),
  })

  const handleEnterDir = (name: string) => {
    enterDir(name)
  }

  return (
    <>
      <div className="h-full w-full p-2">
        <div className="flex justify-between">
          <div className="flex gap-1">
            <EntrySelector />
          </div>
          <ArrowLeftIcon
            className="h-5 w-5 cursor-pointer"
            onClick={backToSidebar}
          ></ArrowLeftIcon>
        </div>
        <Separator className="my-4" />
        <ul className="flex max-w-[300px] flex-col gap-1">
          {entries.map((entry) => {
            const { kind, name } = entry
            const isFile = kind === "file"
            return (
              <li
                className="target flex justify-start"
                data-name={name}
                data-isdir={!isFile}
                // onDrag={(e) => {
                //   e.dataTransfer.setData("name", name)
                // }}
              >
                {isFile ? (
                  <FileEntry name={name} entry={entry} />
                ) : (
                  <div
                    className="flex cursor-pointer items-center justify-center rounded-sm p-2 hover:bg-secondary"
                    onDoubleClick={() => handleEnterDir(name)}
                  >
                    <div className="flex h-8 w-8 items-center justify-center">
                      <FolderIcon className="mt-1 h-5 w-5" />
                    </div>{" "}
                    <p
                      className="w-[220px] truncate pl-2  text-sm"
                      title={name}
                    >
                      {name}
                    </p>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </>
  )
}
