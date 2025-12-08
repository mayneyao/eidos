import { useCallback, useState } from "react"
import type {
  FileHandlerMeta,
  IExtension,
} from "@/packages/core/types/IExtension"
import { TreeNodeType } from "@/packages/core/types/ITreeNode"
import {
  Download,
  FileCodeIcon,
  FileIcon,
  FolderOpen,
  HomeIcon,
  LockIcon,
  LockOpenIcon,
  MailIcon,
  MessageSquareIcon,
  MoreHorizontal,
  MoveHorizontal,
  PackageIcon,
  PanelRightIcon,
  Trash2Icon,
  X,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { URLS } from "@/lib/const"
import { EIDOS_VERSION, isDesktopMode } from "@/lib/env"
import { isDayPageId } from "@/lib/utils"
import { getFileExtension, useFileHandlers } from "@/hooks/use-file-handlers"
import { useFileItemActions } from "@/hooks/use-file-item-actions"
import { useSqlite } from "@/hooks/use-sqlite"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
// import {
//   ContextMenu,
//   ContextMenuContent,
//   ContextMenuItem,
//   ContextMenuSeparator,
//   ContextMenuShortcut,
//   ContextMenuSub,
//   ContextMenuSubContent,
//   ContextMenuSubTrigger,
//   ContextMenuTrigger,
// } from "@/components/ui/context-menu"

import {
  NativeContextMenu as ContextMenu,
  NativeContextMenuContent as ContextMenuContent,
  NativeContextMenuItem as ContextMenuItem,
  NativeContextMenuSeparator as ContextMenuSeparator,
  NativeContextMenuShortcut as ContextMenuShortcut,
  NativeContextMenuSub as ContextMenuSub,
  NativeContextMenuSubContent as ContextMenuSubContent,
  NativeContextMenuSubTrigger as ContextMenuSubTrigger,
  NativeContextMenuTrigger as ContextMenuTrigger,
} from "@/components/ui/native-context-menu"
import { useContextNodes } from "@/components/ai-chat/hooks/use-context-nodes"
import { NodeUpdateTime } from "@/components/nav/node-update-time"
import { useExperimentConfigStore } from "@/components/settings/stores"
import { useNodeMap } from "@/apps/web-app/hooks/use-current-node"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { useEmbedding } from "@/apps/web-app/hooks/use-embedding"
import { useHnsw } from "@/apps/web-app/hooks/use-hnsw"
import { useOpenInPlayground } from "@/apps/web-app/hooks/use-open-in-playground"
import { useSettings } from "@/apps/web-app/hooks/use-settings"
import { useVCardEmail } from "@/apps/web-app/hooks/use-vcard-email"
import { useFilePathFromHash } from "@/apps/web-app/pages/[database]/file-handler/hooks/use-file-path-from-hash"
import { useHandlerSelection } from "@/apps/web-app/pages/[database]/file-handler/hooks/use-handler-selection"
import {
  useAppsStore,
  useSpaceAppStore,
} from "@/apps/web-app/pages/[database]/store"
import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"
import { useTabStore } from "@/apps/web-app/store/tabs"

import { CopyShowHide } from "../copy-show-hide"
import { NodeMoveInto } from "../node-menu/move-into"
import { NodeExportContextMenu } from "../node-menu/node-export"
import { NodeOpenInCursor } from "../node-menu/open-in-cursor"
import { Switch } from "../ui/switch"
import { useToast } from "../ui/use-toast"
import { VCardQrCode } from "../vcard-qr-code"

interface TabContextMenuProps {
  tabId: string
  tabIndex: number
  totalTabs: number
  onClose: () => void
  onCloseOthers: () => void
  onCloseToRight: () => void
  onCloseAll: () => void
  children: React.ReactNode
}

export function TabContextMenu({
  tabId,
  tabIndex,
  totalTabs,
  onClose,
  onCloseOthers,
  onCloseToRight,
  onCloseAll,
  children,
}: TabContextMenuProps) {
  const { t } = useTranslation()
  const tabs = useTabStore((state) => state.tabs)
  const [open, setOpen] = useState(false)

  const isOnlyTab = totalTabs === 1
  const isLastTab = tabIndex >= totalTabs - 1

  // Get current tab and parse its URL for route parameters
  const currentTab = tabs.find((t) => t.id === tabId)
  const tabUrl = currentTab?.url || "/"

  // Parse route parameters from tab URL
  const parseRouteParams = (url: string) => {
    try {
      const urlObj = new URL(url, window.location.origin)
      const path = urlObj.pathname
      const parts = path.split("/").filter(Boolean)
      const result: Record<string, string> = {}

      // Handle different route patterns without database prefix
      if (parts.length >= 1) {
        if (parts[0] === "file-handler") {
          // /file-handler - no additional params
        } else if (parts[0] === "blocks" && parts.length >= 2) {
          // /blocks/:blockId
          result.blockId = parts[1]
        } else if (parts[0] === "extensions" && parts.length >= 2) {
          // /extensions/:scriptId
          result.scriptId = parts[1]
        } else if (parts[0] === "journals" && parts.length >= 2) {
          // /journals/:day
          result.day = parts[1]
        } else {
          // /:table (node page) - first part is the table/node ID
          result.table = parts[0]
        }
      }

      return result
    } catch (e) {
      return {}
    }
  }

  const params = parseRouteParams(tabUrl)
  const location = {
    pathname: tabUrl,
    search: "",
    hash: "",
    state: null,
    key: "default",
  }

  // Check if we're on file-handler page and get current handler
  const isFileHandlerPage = location.pathname.includes("/file-handler")
  const { filePath, fileExtension } = useFilePathFromHash()
  const { selectedHandler, isLoadingHandlers, isLoadingDefault } =
    useHandlerSelection(isFileHandlerPage ? fileExtension : "")
  const { handlers: allHandlers, isLoading: isLoadingAllHandlers } =
    useFileHandlers(fileExtension)

  // Check if we're on blocks page and get current block ID
  const isBlocksPage = location.pathname.includes("/blocks")
  const blockId = isBlocksPage ? params.blockId : null

  // Show menu item if we're on file-handler page and have a handler, or on blocks page with block ID
  const showViewExtension =
    (isFileHandlerPage &&
      selectedHandler &&
      !isLoadingHandlers &&
      !isLoadingDefault) ||
    (isBlocksPage && blockId)

  // Get menu item text based on page type
  const viewExtensionText = isFileHandlerPage
    ? t("nav.dropdown.menu.viewHandler", "View Handler")
    : t("nav.dropdown.menu.viewBlock", "View Block Extension")

  // Show "Open with" submenu if we're on file-handler page and have multiple handlers
  const showOpenWith =
    isFileHandlerPage && !isLoadingAllHandlers && allHandlers.length > 1

  const { sqlite, deleteNode, toggleNodeFullWidth, toggleNodeLock } =
    useSqlite()
  const { setIsRightPanelOpen, setCurrentApp } = useSpaceAppStore()
  const { addNode } = useContextNodes()
  const { addApp } = useAppsStore()

  const { isEmbeddingModeLoaded } = useAppRuntimeStore()
  const { getEmail, enabled } = useVCardEmail()

  // Platform-specific text for "Reveal in File Manager"
  const getRevealText = () => {
    if (typeof navigator !== "undefined") {
      const platform = navigator.platform.toLowerCase()
      if (platform.includes("mac")) {
        return t("nav.dropdown.menu.revealInFinder", "Reveal in Finder")
      } else if (platform.includes("win")) {
        return t("nav.dropdown.menu.revealInExplorer", "Reveal in File Explorer")
      } else {
        return t("nav.dropdown.menu.revealInFileManager", "Reveal in File Manager")
      }
    }
    return t("nav.dropdown.menu.revealInFileManager", "Reveal in File Manager")
  }

  // Get current node based on parsed params (instead of useCurrentNode hook)
  const allNodesMap = useNodeMap()
  const getCurrentNode = () => {
    const { table: nodeId, day } = params
    if (day && isDayPageId(day)) {
      return {
        id: day,
        name: day,
        type: TreeNodeType.Doc,
      }
    }
    return nodeId ? allNodesMap[nodeId] : null
  }
  const node = getCurrentNode()

  const { createEmbedding } = useHnsw()
  const { experiment } = useExperimentConfigStore()
  const { space } = useCurrentPathInfo()
  const { toast } = useToast()
  const updateTab = useTabStore((state) => state.updateTab)

  // Custom navigate function for tab context
  const tabNavigate = (
    to: string | { pathname?: string; search?: string; hash?: string }
  ) => {
    const url =
      typeof to === "string"
        ? to
        : `${to.pathname || ""}${to.search || ""}${to.hash || ""}`
    updateTab(tabId, { url })
  }

  // File item actions context
  const fileActionsContext = {
    filePath: filePath || "",
    space,
    navigate: tabNavigate as any,
    selectedHandler,
    blockId,
    isFileHandlerPage,
    isBlocksPage,
  }

  const { openInFileManager, openWith, viewExtension } =
    useFileItemActions(fileActionsContext)

  const onPlaygroundChange = useCallback(
    async (
      filename: string,
      content: string,
      spaceName: string,
      blockId: string
    ) => {
      if (spaceName !== space || !node || blockId !== node.id) {
        return
      }
      const res = await sqlite?.doc.createOrUpdate({
        id: node.id,
        text: content,
        type: "markdown",
        mode: "replace",
      })
      console.log("res", res)
      if (res?.success) {
        toast({
          title: res.msg,
        })
        console.log(`Document ${filename} changed in playground`)

        // Trigger custom event to refresh the editor
        window.dispatchEvent(
          new CustomEvent("eidos-doc-refresh", {
            detail: { docId: node.id },
          })
        )
      }
    },
    [node, space, sqlite, toast]
  )

  const { openInPlayground } = useOpenInPlayground({
    onPlaygroundChange,
  })

  const deleteCurrentNode = () => {
    if (node) {
      deleteNode(node)
      tabNavigate(`/`)
    }
  }

  const handleAddToPanel = () => {
    if (!node) return
    // Create node app URL in the format node://<nodeid>@<space>
    const nodeApp = `node://${node.id}@${space}`

    // Add the node app to the apps list
    addApp(nodeApp)

    // Open right panel and set the current app to the node
    setIsRightPanelOpen(true)
    setCurrentApp(nodeApp)
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          {/* Tab Operations */}
          <ContextMenuItem onClick={onClose}>
            Close
            <ContextMenuShortcut>Command+W</ContextMenuShortcut>
          </ContextMenuItem>

          <ContextMenuSeparator />

          <ContextMenuItem onClick={onCloseOthers} disabled={isOnlyTab}>
            Close Others
          </ContextMenuItem>

          <ContextMenuItem onClick={onCloseToRight} disabled={isLastTab}>
            Close Tabs to the Right
          </ContextMenuItem>

          <ContextMenuSeparator />

          <ContextMenuItem onClick={onCloseAll}>Close All</ContextMenuItem>

          {/* Context-specific operations */}
          {showViewExtension && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={viewExtension}>
                <FileCodeIcon className="mr-2 h-4 w-4" />
                <span>{viewExtensionText}</span>
              </ContextMenuItem>
            </>
          )}

          {/* Open with submenu (file-handler page with multiple handlers) */}
          {showOpenWith && (
            <>
              <ContextMenuSeparator />
              <ContextMenuSub>
                <ContextMenuSubTrigger>
                  <FileIcon className="mr-2 h-4 w-4" />
                  <span>{t("file.menu.openWith", "Open with")}</span>
                </ContextMenuSubTrigger>
                <ContextMenuSubContent>
                  {allHandlers.map((handler) => {
                    const meta = handler.meta as FileHandlerMeta
                    return (
                      <ContextMenuItem
                        key={handler.id}
                        onClick={() => openWith(handler)}
                      >
                        {meta.fileHandler.icon && (
                          <span className="mr-2">{meta.fileHandler.icon}</span>
                        )}
                        {meta.fileHandler.title || handler.name}
                      </ContextMenuItem>
                    )
                  })}
                </ContextMenuSubContent>
              </ContextMenuSub>
            </>
          )}

          {/* Open file in file manager (file-handler page only) */}
          {isFileHandlerPage && filePath && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={openInFileManager}>
                <FolderOpen className="mr-2 h-4 w-4" />
                <span>
                  {getRevealText()}
                </span>
              </ContextMenuItem>
            </>
          )}

          {/* Node-specific operations */}
          {node && (
            <>
              {node.type === "doc" && !isDayPageId(node.id) && (
                <>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    className="flex justify-between"
                    onClick={(e) => {
                      e.preventDefault()
                      toggleNodeFullWidth(node)
                    }}
                  >
                    {/* icon for full width */}
                    <div className="flex items-center gap-2">
                      <MoveHorizontal className="mr-2 h-4 w-4" />
                      {t("nav.dropdown.menu.fullWidth")}
                    </div>
                    <Switch checked={node.is_full_width} />
                  </ContextMenuItem>
                  <ContextMenuItem
                    className="flex justify-between"
                    onClick={(e) => {
                      e.preventDefault()
                      toggleNodeLock(node)
                    }}
                  >
                    <div className="flex items-center gap-2">
                      {node.is_locked ? (
                        <LockIcon className="mr-2 h-4 w-4" />
                      ) : (
                        <LockOpenIcon className="mr-2 h-4 w-4" />
                      )}
                      {t("nav.dropdown.menu.lock")}
                    </div>
                    <Switch checked={node.is_locked} />
                  </ContextMenuItem>
                </>
              )}
              {node.type === "table" && enabled && (
                <>
                  <ContextMenuSeparator />
                  <DialogTrigger className="w-full">
                    <ContextMenuItem>
                      <MailIcon className="mr-2 h-4 w-4" />
                      {t("nav.dropdown.menu.mail")}
                    </ContextMenuItem>
                  </DialogTrigger>
                </>
              )}
              <ContextMenuSeparator />
              <NodeExportContextMenu node={node} />
              {/* <NodeOpenInCursor
                  node={node}
                  openInPlayground={openInPlayground}
                /> */}
              {node.type === "dataview" && (
                <ContextMenuItem onClick={handleAddToPanel}>
                  <PanelRightIcon className="mr-2 h-4 w-4" />
                  {t("node.menu.addToPanel", "Add to Panel")}
                </ContextMenuItem>
              )}
              {/* TODO: NodeMoveInto with Command component not supported in native context menu */}
              {/* {node.type === "doc" && !isDayPageId(node.id) && (
                <>
                  <ContextMenuSub>
                    <ContextMenuSubTrigger>
                      <PackageIcon className="mr-2 h-4 w-4" />
                      {t("node.menu.moveInto")}
                    </ContextMenuSubTrigger>
                    <ContextMenuSubContent className="w-48">
                      <NodeMoveInto node={node} />
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                </>
              )} */}
              {!isDayPageId(node.id) && (
                <ContextMenuItem onClick={deleteCurrentNode}>
                  <Trash2Icon className="mr-2 h-4 w-4"></Trash2Icon>
                  <span>{t("common.delete")}</span>
                </ContextMenuItem>
              )}
              <NodeUpdateTime />
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>
      <Dialog>
        <DialogContent className="">
          <DialogHeader>
            <DialogTitle>{t("nav.dropdown.menu.sendMailToEidos")}</DialogTitle>
            {node && (
              <div className="!mt-5 flex w-full flex-col gap-4">
                <div className="flex w-full justify-center">
                  <VCardQrCode
                    firstName={node.name || t("common.untitled")}
                    lastName={space}
                    email={getEmail(node.id, space)}
                  />
                </div>
                <DialogDescription>
                  {node && <CopyShowHide text={getEmail(node.id, space)} />}
                </DialogDescription>
                <p className="p-2">
                  {t("nav.dropdown.menu.emailInstructions")}
                </p>
              </div>
            )}
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </>
  )
}
