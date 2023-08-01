import { MouseEventHandler, useRef, useState } from "react"
import { ITreeNode } from "@/worker/meta_table/tree"
import { useClickAway } from "ahooks"
import { useNavigate } from "react-router-dom"

import { useSqlite } from "@/hooks/use-sqlite"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

import { Input } from "../ui/input"

interface INodeItemProps {
  databaseName: string
  node: ITreeNode
  children?: React.ReactNode
}

export function NodeItem({ databaseName, children, node }: INodeItemProps) {
  const { duplicateTable, deleteNode, renameNode } = useSqlite(databaseName)
  const [renameOpen, setRenameOpen] = useState(false)
  const [newName, setNewName] = useState(node.name)
  const renameInputRef = useRef<HTMLInputElement>(null)

  useClickAway(() => {
    setRenameOpen(false)
  }, [renameInputRef])

  const router = useNavigate()
  const handleDeleteTable = () => {
    deleteNode(node)
    router(`/${databaseName}`)
  }
  const handleRename: MouseEventHandler<HTMLDivElement> = (e) => {
    setRenameOpen(true)
    setTimeout(() => {
      renameInputRef.current?.focus()
    }, 300)
    e.stopPropagation()
  }

  const handleRenameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      renameNode(node.id, newName)
      setRenameOpen(false)
    }
    if (e.key === "Escape") {
      setRenameOpen(false)
    }
  }
  return (
    <ContextMenu>
      <Popover open={renameOpen}>
        <ContextMenuTrigger>
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
        <ContextMenuItem inset onClick={handleDeleteTable}>
          Delete
          {/* <ContextMenuShortcut>del</ContextMenuShortcut> */}
        </ContextMenuItem>
        <ContextMenuItem inset onClick={handleRename}>
          Rename
        </ContextMenuItem>
        {node.type === "table" && (
          <>
            <ContextMenuItem
              inset
              onClick={() => duplicateTable(node.name, `${node.name}_copy`)}
              disabled
            >
              Duplicate
              {/* <ContextMenuShortcut>⌘R</ContextMenuShortcut> */}
            </ContextMenuItem>
            <ContextMenuSub>
              <ContextMenuSubTrigger inset>Export </ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-48">
                {/* <ContextMenuItem>
              Export As...
              <ContextMenuShortcut>⇧⌘S</ContextMenuShortcut>
            </ContextMenuItem> */}
                <ContextMenuItem disabled>Csv(.csv)</ContextMenuItem>
                <ContextMenuItem disabled>Excel(.xlsx)</ContextMenuItem>
                {/* <ContextMenuSeparator /> */}
                {/* <ContextMenuItem>Developer Tools</ContextMenuItem> */}
              </ContextMenuSubContent>
            </ContextMenuSub>
          </>
        )}

        {/*<ContextMenuSeparator />
        <ContextMenuCheckboxItem checked>
          Show Bookmarks Bar
          <ContextMenuShortcut>⌘⇧B</ContextMenuShortcut>
        </ContextMenuCheckboxItem>
        <ContextMenuCheckboxItem>Show Full URLs</ContextMenuCheckboxItem>
        <ContextMenuSeparator />
        <ContextMenuRadioGroup value="pedro">
          <ContextMenuLabel inset>People</ContextMenuLabel>
          <ContextMenuSeparator />
          <ContextMenuRadioItem value="pedro">
            Pedro Duarte
          </ContextMenuRadioItem>
          <ContextMenuRadioItem value="colm">Colm Tuite</ContextMenuRadioItem>
        </ContextMenuRadioGroup> */}
      </ContextMenuContent>
    </ContextMenu>
  )
}
