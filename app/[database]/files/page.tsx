import { useRef, useState } from "react"
import { useDrop } from "ahooks"
import { FileIcon, FolderIcon, HomeIcon } from "lucide-react"
import Selecto from "react-selecto"

import { Separator } from "@/components/ui/separator"

import { useFileSystem } from "./hooks"
import { FileItemContextMenu, FileManagerContextMenu } from "./menu"

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
    <>
      <FileManagerContextMenu>
        <div className="h-full w-full p-6" ref={dropRef} id="file-container">
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
          <ul className="flex flex-col gap-1 p-2">
            {entries.map((entry) => {
              const { kind, name } = entry
              const isFile = kind === "file"
              return (
                <FileItemContextMenu key={name}>
                  <li
                    className="target flex max-w-[400px] justify-start p-1"
                    data-name={name}
                    data-isdir={!isFile}
                  >
                    {isFile ? (
                      <div className="flex cursor-pointer">
                        <FileIcon className="mt-1 h-5 w-5" />
                        <div className="w-[350px] truncate pl-2" title={name}>
                          {name}
                        </div>
                      </div>
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
                </FileItemContextMenu>
              )
            })}
          </ul>
        </div>
      </FileManagerContextMenu>
      <Selecto
        // The container to add a selection element
        container={dropRef.current}
        // The area to drag selection element (default: container)
        dragContainer={dropRef.current}
        // Targets to select. You can register a queryselector or an Element.
        selectableTargets={[".target"]}
        // Whether to select by click (default: true)
        selectByClick={true}
        // Whether to select from the target inside (default: true)
        selectFromInside={true}
        // After the select, whether to select the next target with the selected target (deselected if the target is selected again).
        continueSelect={false}
        // Determines which key to continue selecting the next target via keydown and keyup.
        toggleContinueSelect={"shift"}
        // The container for keydown and keyup events
        keyContainer={window}
        // The rate at which the target overlaps the drag area to be selected. (default: 100)
        hitRate={100}
        onSelect={(e) => {
          e.added.forEach((el) => {
            el.classList.add("selected")
          })
          e.removed.forEach((el) => {
            el.classList.remove("selected")
          })
          const prevSelected: [string, boolean][] = e.beforeSelected.map(
            (el) => {
              const name = el.getAttribute("data-name")
              const isDir = el.getAttribute("data-isdir") === "true"
              return [name!, isDir]
            }
          )
          setPrevSelectedEntries(new Map(prevSelected))
          const selected: [string, boolean][] = e.selected.map((el) => {
            const name = el.getAttribute("data-name")
            const isDir = el.getAttribute("data-isdir") === "true"
            return [name!, isDir]
          })
          setSelectedEntries(new Map(selected))
        }}
      />
    </>
  )
}
