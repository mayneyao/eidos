import { MouseEventHandler, useRef, useState } from "react"
import { useClickAway } from "ahooks"
import {
  ClipboardPasteIcon,
  CopyIcon,
  FilePlus2Icon,
  FileSpreadsheetIcon,
  FolderPlusIcon,
  PackageIcon,
  PencilLineIcon,
  PinIcon,
  PinOffIcon,
  ScissorsIcon,
  Trash2Icon,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"

import { isInkServiceMode } from "@/lib/env"
import { ITreeNode } from "@/lib/store/ITreeNode"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useGoto } from "@/hooks/use-goto"
import { useNodeTree } from "@/hooks/use-node-tree"
import { useSqlite } from "@/hooks/use-sqlite"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
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

import { NodeMoveInto } from "../../node-menu/move-into"
import { NodeExportContextMenu } from "../../node-menu/node-export"
import { Input } from "../../ui/input"
import { useTreeOperations } from "./hooks"
import { useFolderStore } from "./store"

interface INodeItemProps {
  databaseName: string
  node: ITreeNode
  depth: number
  children?: React.ReactNode
}

export function NodeItem({
  databaseName,
  children,
  node,
  depth,
}: INodeItemProps) {
  const { t } = useTranslation()
  const {
    createDoc,
    createTable,
    duplicateTable,
    deleteNode,
    renameNode,
    sqlite,
    createFolder,
  } = useSqlite(databaseName)
  const { setNode, pin, unpin } = useNodeTree()
  const { handleCut, handlePaste } = useTreeOperations()
  const { currentCut } = useFolderStore()
  const [renameOpen, setRenameOpen] = useState(false)
  const [newName, setNewName] = useState(node.name)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const { space } = useCurrentPathInfo()
  const goto = useGoto()

  const handleCreateDoc = async () => {
    const docId = await createDoc("", node.id)
    goto(space, docId)
  }

  const handleCreateTable = async () => {
    const tableId = await createTable("", node.id)
    goto(space, tableId)
  }
  const handleCreateFolder = () => {
    createFolder(node.id)
  }

  useClickAway(() => {
    if (renameOpen) {
      renameNode(node.id, newName)
      setRenameOpen(false)
    }
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
      setNewName(node.name) // Reset to original name when canceling
    }
  }
  if (isInkServiceMode) {
    return children
  }

  return (
    <ContextMenu>
      <Popover open={renameOpen}>
        <ContextMenuTrigger className="w-full">
          <div className="w-full">
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
        {/* <ContextMenuItem onClick={() => navigator.clipboard.writeText(node.id)}>
          <CopyIcon className="pr-2" />
          {t("node.menu.copyId")}
        </ContextMenuItem> */}
        <ContextMenuItem onClick={handleDeleteTable}>
          <Trash2Icon className="pr-2" /> {t("common.delete")}
        </ContextMenuItem>
        <ContextMenuItem onClick={handleRename}>
          <PencilLineIcon className="pr-2" />
          {t("node.menu.rename")}
        </ContextMenuItem>

        <ContextMenuItem
          onClick={() => handleCut(node.id)}
          disabled={Boolean(currentCut && currentCut !== node.id)}
        >
          <ScissorsIcon className="pr-2" />
          {currentCut === node.id
            ? t("node.menu.cancelCut")
            : t("node.menu.cut")}
        </ContextMenuItem>

        {node.type === "folder" && (
          <ContextMenuItem
            onClick={() => handlePaste(node)}
            disabled={!currentCut}
          >
            <ClipboardPasteIcon className="pr-2" />
            {t("common.paste")}
          </ContextMenuItem>
        )}

        {node.type !== "folder" && (
          <>
            {node.is_pinned ? (
              <ContextMenuItem onClick={() => unpin(node.id)}>
                <PinOffIcon className="pr-2" />
                {t("node.menu.unpin")}
              </ContextMenuItem>
            ) : (
              <ContextMenuItem onClick={() => pin(node.id)}>
                <PinIcon className="pr-2" />
                {t("node.menu.pin")}
              </ContextMenuItem>
            )}
          </>
        )}

        <ContextMenuSeparator />
        {node.type === "folder" && (
          <>
            <ContextMenuItem onClick={handleCreateDoc}>
              <FilePlus2Icon className="pr-2" />
              {t("node.menu.newDoc")}
            </ContextMenuItem>
            <ContextMenuItem onClick={handleCreateTable}>
              <FileSpreadsheetIcon className="pr-2" />
              {t("node.menu.newTable")}
            </ContextMenuItem>
            <ContextMenuItem onClick={handleCreateFolder} disabled={depth > 6}>
              <FolderPlusIcon className="pr-2" />
              {t("node.menu.newNestedFolder")}
            </ContextMenuItem>
          </>
        )}
        {node.type === "table" && (
          <>
            <ContextMenuItem
              onClick={() => duplicateTable(node.name, `${node.name}_copy`)}
              disabled
            >
              <CopyIcon className="pr-2" />
              {t("node.menu.duplicate")}
            </ContextMenuItem>
          </>
        )}
        {node.type === "doc" && (
          <>
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <PackageIcon className="pr-2" />
                {t("node.menu.moveInto")}
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-48">
                <NodeMoveInto node={node} />
              </ContextMenuSubContent>
            </ContextMenuSub>
          </>
        )}
        {node.type !== "folder" && <NodeExportContextMenu node={node} />}
      </ContextMenuContent>
    </ContextMenu>
  )
}
