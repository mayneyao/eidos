import { useRef, useState } from "react"
import { useDrop } from "ahooks"
import { FileIcon, FolderIcon, HomeIcon } from "lucide-react"

import { Separator } from "@/components/ui/separator"

import { useFileSystem } from "./hooks"
import { FileManagerContextMenu } from "./menu"

export const FileManager = () => {
  const {
    entries,
    addFiles,
    enterDir,
    currentPath,
    enterPathByIndex,
    goRootDir,
    getFileUrlPath,
  } = useFileSystem()
  const [isHovering, setIsHovering] = useState(false)
  const dropRef = useRef(null)
  useDrop(dropRef, {
    onFiles: (files, e) => {
      addFiles(files)
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
    <FileManagerContextMenu>
      <div className="h-full w-full p-6" ref={dropRef}>
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
        <Separator className="my-4" />
        <ul className="flex flex-wrap gap-2">
          {entries.map((entry) => {
            const { kind, name } = entry
            const isFile = kind === "file"
            const filepath = getFileUrlPath(name)
            return (
              <li key={name} className="flex w-[300px] justify-start">
                {isFile ? (
                  <a href={filepath} className="flex">
                    <FileIcon className="mt-1 h-5 w-5" />
                    <div className="w-[250px] pl-2">{name}</div>
                  </a>
                ) : (
                  <div
                    className="flex cursor-pointer"
                    onClick={() => handleEnterDir(name)}
                  >
                    <FolderIcon className="mt-1 h-5 w-5" />
                    <div className="w-[250px] pl-2">{name}</div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </FileManagerContextMenu>
  )
}
