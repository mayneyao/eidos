import { MouseEventHandler, useRef, useState } from "react"
import { useClickAway } from "ahooks"
import { FolderPlusIcon } from "lucide-react"
import ReactDOM from "react-dom"

import { useFileSystem } from "@/hooks/use-files"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { Input } from "@/components/ui/input"

export function FileManagerContextMenu({ children }: any) {
  const { addDir, backDir, isRootDir } = useFileSystem()
  const [newName, setNewName] = useState("folder")
  const [renameOpen, setRenameOpen] = useState(false)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const renameInputRef = useRef<HTMLInputElement>(null)

  // useClickAway(() => {
  //   renameOpen && setRenameOpen(false)
  //   setNewName("folder")
  // }, renameInputRef)

  // for now opfs is not supporting rename dir, so just create new dir with given name
  const handleRename: MouseEventHandler<HTMLDivElement> = (e) => {
    setRenameOpen(true)
    setTimeout(() => {
      renameInputRef.current?.focus()
    }, 300)
    const position = e.currentTarget.getBoundingClientRect()
    setPos({ x: position.x, y: position.y })
    e.stopPropagation()
  }

  const handleLoadLocalFolder: MouseEventHandler<HTMLDivElement> = (e) => {}
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
    <>
      <ContextMenu>
        <ContextMenuTrigger className="h-full w-full">
          <div>{children}</div>
        </ContextMenuTrigger>

        <ContextMenuContent className="w-64">
          <ContextMenuItem onSelect={(e: any) => handleRename(e)}>
            <div className="flex gap-2">
              <FolderPlusIcon className="h-5 w-5"></FolderPlusIcon>
              New folder
            </div>
          </ContextMenuItem>
          <ContextMenuItem
            inset
            onSelect={(e: any) => handleLoadLocalFolder(e)}
          >
            Load local folder
          </ContextMenuItem>
          <ContextMenuItem inset disabled={isRootDir} onSelect={backDir}>
            Back
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {renameOpen &&
        ReactDOM.createPortal(
          <div
            className="h-[200px] w-[300px] p-0"
            style={{
              position: "absolute",
              top: pos.y,
              left: pos.x,
              zIndex: 1000,
            }}
          >
            <Input
              ref={renameInputRef}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={handleRenameKeyDown}
              autoFocus
            />
          </div>,
          document.body
        )}
    </>
  )
}
