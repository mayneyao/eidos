import { MouseEventHandler, useRef, useState } from "react"
import { useClickAway } from "ahooks"
import {
  CopyIcon,
  PackageIcon,
  PencilLineIcon,
  PinIcon,
  PinOffIcon,
  Trash2Icon,
} from "lucide-react"
import { useNavigate } from "react-router-dom"

import { BGEM3 } from "@/lib/ai/llm_vendors/bge"
import { ITreeNode } from "@/lib/store/ITreeNode"
import { useHnsw } from "@/hooks/use-hnsw"
import { useNodeTree } from "@/hooks/use-node-tree"
import { useSqlite } from "@/hooks/use-sqlite"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
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

import { NodeMoveInto } from "../node-menu/move-into"
import { NodeExportContextMenu } from "../node-menu/node-export"
import { Input } from "../ui/input"

interface INodeItemProps {
  databaseName: string
  node: ITreeNode
  children?: React.ReactNode
}

export function NodeItem({ databaseName, children, node }: INodeItemProps) {
  const { duplicateTable, deleteNode, renameNode, sqlite } =
    useSqlite(databaseName)
  const { setNode, pin, unpin } = useNodeTree()
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
        <ContextMenuItem onClick={handleDeleteTable}>
          <Trash2Icon className="pr-2" /> Delete
        </ContextMenuItem>
        <ContextMenuItem onClick={handleRename}>
          <PencilLineIcon className="pr-2" />
          Rename
        </ContextMenuItem>
        {node.is_pinned ? (
          <ContextMenuItem onClick={() => unpin(node.id)}>
            <PinOffIcon className="pr-2" />
            Unpin
          </ContextMenuItem>
        ) : (
          <ContextMenuItem onClick={() => pin(node.id)}>
            <PinIcon className="pr-2" />
            Pin
          </ContextMenuItem>
        )}
        {node.type === "table" && (
          <>
            <ContextMenuItem
              onClick={() => duplicateTable(node.name, `${node.name}_copy`)}
              disabled
            >
              <CopyIcon className="pr-2" />
              Duplicate
              {/* <ContextMenuShortcut>⌘R</ContextMenuShortcut> */}
            </ContextMenuItem>
          </>
        )}
        {node.type === "doc" && (
          <>
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <PackageIcon className="pr-2" />
                Move Into
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-48">
                <NodeMoveInto node={node} />
              </ContextMenuSubContent>
            </ContextMenuSub>
          </>
        )}
        <NodeExportContextMenu node={node} />
      </ContextMenuContent>
    </ContextMenu>
  )
}
