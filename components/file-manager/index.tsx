import { useRef, useState } from "react"
import { useDrop } from "ahooks"
import { ArrowLeftIcon, FolderIcon, HomeIcon } from "lucide-react"

import { useAppStore } from "@/lib/store/app-store"
import { useFileSystem } from "@/hooks/use-files"
import { Separator } from "@/components/ui/separator"

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
  // useDrop(dropRef, {
  //   onFiles: (files, e) => {
  //     // when drop files into opfs via file manager, we don't use uuid as file name, keep the original name
  //     addFiles(files, false)
  //   },
  //   onDom: (content: string, e) => {
  //     alert(`custom: ${content} dropped`)
  //   },
  //   onDragEnter: () => setIsHovering(true),
  //   onDragLeave: () => setIsHovering(false),
  // })

  const handleEnterDir = (name: string) => {
    enterDir(name)
  }

  return (
    <>
      <div className="h-full w-full p-2">
        <div className="flex justify-between">
          <div className="flex gap-1">
            <HomeIcon className="h-5 w-5 cursor-pointer" onClick={goRootDir} />
            {currentPath.map((item, index) => {
              return (
                <div
                  key={index}
                  className="cursor-pointer"
                  onClick={() => enterPathByIndex(index)}
                >
                  / {item}
                </div>
              )
            })}
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
                    className="flex cursor-pointer"
                    onDoubleClick={() => handleEnterDir(name)}
                  >
                    <FolderIcon className="mt-1 h-5 w-5" />
                    <div className="w-[350px] truncate pl-2" title={name}>
                      {name}
                    </div>
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
