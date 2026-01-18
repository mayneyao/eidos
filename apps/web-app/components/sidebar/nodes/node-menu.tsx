import { useRef, useState, type MouseEventHandler } from "react"
import type { ITreeNode } from "@/packages/core/types/ITreeNode"
import { useClickAway } from "ahooks"
import {
  ClipboardPasteIcon,
  CopyIcon,
  FileIcon,
  FilePlus2Icon,
  FileSpreadsheetIcon,
  FolderPlusIcon,
  MessageSquareIcon,
  PackageIcon,
  PanelRightIcon,
  PencilLineIcon,
  PinIcon,
  PinOffIcon,
  ScissorsIcon,
  Trash2Icon,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { isInkServiceMode } from "@/lib/env"
import {
  NativeContextMenu as ContextMenu,
  NativeContextMenuContent as ContextMenuContent,
  NativeContextMenuItem as ContextMenuItem,
  NativeContextMenuSeparator as ContextMenuSeparator,
  NativeContextMenuSub as ContextMenuSub,
  NativeContextMenuSubContent as ContextMenuSubContent,
  NativeContextMenuSubTrigger as ContextMenuSubTrigger,
  NativeContextMenuTrigger as ContextMenuTrigger,
} from "@/components/ui/native-context-menu"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useContextNodes } from "@/components/ai-chat/hooks/use-context-nodes"
import { useAllExtNodes } from "@/apps/web-app/hooks/use-all-ext-nodes"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { useGoto } from "@/apps/web-app/hooks/use-goto"
import { useNode } from "@/apps/web-app/hooks/use-nodes"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import {
  useAppsStore,
  useSpaceAppStore,
} from "@/apps/web-app/pages/[database]/store"

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
    createExtNode,
    createFolder,
    createView,
  } = useSqlite(databaseName)
  const { pin, unpin } = useNode()
  const { handleCut, handlePaste } = useTreeOperations()
  const { currentCut } = useFolderStore()
  const { setIsRightPanelOpen, setCurrentApp } = useSpaceAppStore()
  const { addNode } = useContextNodes()
  const { addApp } = useAppsStore()

  const [renameOpen, setRenameOpen] = useState(false)
  const [newName, setNewName] = useState(node.name)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const { space } = useCurrentPathInfo()
  const goto = useGoto()

  const { extNodes } = useAllExtNodes()

  const handleCreateDoc = async () => {
    const docId = await createDoc("", node.id)
    goto(space, docId)
  }

  const handleCreateTable = async () => {
    const tableId = await createTable("", node.id)
    goto(space, tableId)
  }

  const handleCreateView = async () => {
    const viewId = await createView(node.id)
    goto(space, viewId)
  }

  const handleCreateFolder = () => {
    createFolder(node.id)
  }

  const handleCreateExtNode = async (type: ITreeNode["type"]) => {
    const nodeType = type.startsWith("ext__") ? type.split("ext__")[1] : type
    const extNode = extNodes.find(
      (node) => node.meta?.extNode?.type === nodeType
    )
    if (!extNode) return
    const extNodeId = await createExtNode(nodeType, node.id)
    if (!extNodeId) return
    goto(space, extNodeId)
  }

  const handleAddToChat = () => {
    // Open right panel if not already open
    setIsRightPanelOpen(true)
    // Set current app to chat
    setCurrentApp("chat")

    // Add the node to chat context (duplicates are handled in the store)
    setTimeout(() => {
      addNode(node)
    }, 100)
  }

  const handleAddToPanel = () => {
    // Create node app URL in the format node://<nodeid>@<space>
    const nodeApp = `node://${node.id}@${space}`

    // Add the node app to the apps list
    addApp(nodeApp)

    // Open right panel and set the current app to the node
    setIsRightPanelOpen(true)
    setCurrentApp(nodeApp)
  }

  useClickAway(() => {
    if (renameOpen) {
      renameNode(node.id, newName)
      setRenameOpen(false)
    }
  }, [renameInputRef])

  const { navigate } = useRouterAdapter()

  const handleDeleteTable = () => {
    deleteNode(node)
    navigate(`/${databaseName}`)
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
            <PopoverTrigger tabIndex={-1}>
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
      <ContextMenuContent className="w-56">
        {/* <ContextMenuItem onClick={() => navigator.clipboard.writeText(node.id)}>
          <CopyIcon className="pr-1.5" />
          {t("node.menu.copyId")}
        </ContextMenuItem> */}
        <ContextMenuItem onClick={handleDeleteTable}>
          <Trash2Icon className="pr-1.5" /> {t("common.delete")}
        </ContextMenuItem>
        <ContextMenuItem onClick={handleRename}>
          <PencilLineIcon className="pr-1.5" />
          {t("node.menu.rename")}
        </ContextMenuItem>

        <ContextMenuItem onClick={() => navigator.clipboard.writeText(node.id)}>
          <CopyIcon className="pr-1.5" />
          {t("node.menu.copyId")}
        </ContextMenuItem>

        <ContextMenuItem onClick={handleAddToChat}>
          <MessageSquareIcon className="pr-1.5" />
          {t("node.menu.addToChat", "Add to Chat")}
        </ContextMenuItem>

        <ContextMenuItem
          onClick={() => handleCut(node.id)}
          disabled={Boolean(currentCut && currentCut !== node.id)}
        >
          <ScissorsIcon className="pr-1.5" />
          {currentCut === node.id
            ? t("node.menu.cancelCut")
            : t("node.menu.cut")}
        </ContextMenuItem>

        {node.type === "folder" && (
          <ContextMenuItem
            onClick={() => handlePaste(node)}
            disabled={!currentCut}
          >
            <ClipboardPasteIcon className="pr-1.5" />
            {t("common.paste")}
          </ContextMenuItem>
        )}

        {node.type !== "folder" && (
          <>
            {node.is_pinned ? (
              <ContextMenuItem onClick={() => unpin(node.id)}>
                <PinOffIcon className="pr-1.5" />
                {t("node.menu.unpin")}
              </ContextMenuItem>
            ) : (
              <ContextMenuItem onClick={() => pin(node.id)}>
                <PinIcon className="pr-1.5" />
                {t("node.menu.pin")}
              </ContextMenuItem>
            )}
          </>
        )}

        <ContextMenuSeparator />
        {node.type === "dataview" && (
          <ContextMenuItem onClick={handleAddToPanel}>
            <PanelRightIcon className="pr-1.5" />
            {t("node.menu.addToPanel", "Add to Panel")}
          </ContextMenuItem>
        )}

        {node.type === "folder" && (
          <>
            <ContextMenuItem onClick={handleCreateDoc}>
              <FilePlus2Icon className="pr-1.5" />
              {t("node.menu.newDoc")}
            </ContextMenuItem>
            <ContextMenuItem onClick={handleCreateTable}>
              <FileSpreadsheetIcon className="pr-1.5" />
              {t("node.menu.newTable")}
            </ContextMenuItem>
            <ContextMenuItem onClick={handleCreateView}>
              <FileSpreadsheetIcon className="pr-1.5" />
              {t("node.menu.newDataView")}
              <span className="mx-2 px-2 py-0.5 text-xs rounded-full bg-purple-100 text-purple-700">
                {t("common.badge.alpha")}
              </span>
            </ContextMenuItem>
            <ContextMenuItem onClick={handleCreateFolder} disabled={depth > 6}>
              <FolderPlusIcon className="pr-1.5" />
              {t("node.menu.newNestedFolder")}
            </ContextMenuItem>
            {extNodes.length > 0 && <ContextMenuSeparator />}
            {extNodes.map((extNode) => {
              const firstHandler = extNode.meta?.extNode?.type
              return (
                <ContextMenuItem
                  key={extNode.id}
                  onClick={() =>
                    handleCreateExtNode(
                      `ext__${firstHandler}` as `ext__${string}`
                    )
                  }
                >
                  <FileIcon className="pr-1.5" />
                  {extNode.name}
                </ContextMenuItem>
              )
            })}
          </>
        )}
        {node.type === "table" && (
          <>
            <ContextMenuItem
              onClick={() => duplicateTable(node.name, `${node.name}_copy`)}
              disabled
            >
              <CopyIcon className="pr-1.5" />
              {t("node.menu.duplicate")}
            </ContextMenuItem>
          </>
        )}
        {/* TODO: NodeMoveInto with Command component not supported in native context menu */}
        {/* {node.type === "doc" && (
          <>
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <PackageIcon className="pr-1.5" />
                {t("node.menu.moveInto")}
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-48">
                <NodeMoveInto node={node} />
              </ContextMenuSubContent>
            </ContextMenuSub>
          </>
        )} */}
        {node.type !== "folder" && <NodeExportContextMenu node={node} />}
        {/* <NodeOpenInCursorContextMenu node={node} /> */}
      </ContextMenuContent>
    </ContextMenu>
  )
}
