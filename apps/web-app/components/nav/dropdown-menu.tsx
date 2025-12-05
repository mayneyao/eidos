import { useCallback, useState } from "react"
import type {
  FileHandlerMeta,
  IExtension,
} from "@/packages/core/types/IExtension"
import {
  CogIcon,
  CommandIcon,
  Download,
  FileCodeIcon,
  FileIcon,
  FolderOpen,
  Github,
  HomeIcon,
  Keyboard,
  LockIcon,
  LockOpenIcon,
  MailIcon,
  MessageSquareIcon,
  MoreHorizontal,
  MoveHorizontal,
  PackageIcon,
  PanelRightIcon,
  Trash2Icon,
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
import { Link } from "@/components/ui/link"
import { useContextNodes } from "@/components/ai-chat/hooks/use-context-nodes"
import { DiscordIcon } from "@/components/icons/discord"
import { NodeUpdateTime } from "@/components/nav/node-update-time"
import { useExperimentConfigStore } from "@/components/settings/stores"
import { useCurrentNode } from "@/apps/web-app/hooks/use-current-node"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { useEmbedding } from "@/apps/web-app/hooks/use-embedding"
import { useHnsw } from "@/apps/web-app/hooks/use-hnsw"
import { useOpenInPlayground } from "@/apps/web-app/hooks/use-open-in-playground"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import { useSettings } from "@/apps/web-app/hooks/use-settings"
import { useVCardEmail } from "@/apps/web-app/hooks/use-vcard-email"
import { useFilePathFromHash } from "@/apps/web-app/pages/[database]/file-handler/hooks/use-file-path-from-hash"
import { useHandlerSelection } from "@/apps/web-app/pages/[database]/file-handler/hooks/use-handler-selection"
import {
  useAppsStore,
  useSpaceAppStore,
} from "@/apps/web-app/pages/[database]/store"
import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"

import { CopyShowHide } from "../copy-show-hide"
import { NodeMoveInto } from "../node-menu/move-into"
import { NodeExport } from "../node-menu/node-export"
import { NodeOpenInCursor } from "../node-menu/open-in-cursor"
import { Switch } from "../ui/switch"
import { useToast } from "../ui/use-toast"
import { VCardQrCode } from "../vcard-qr-code"
import { UpdateStatusComponent } from "./update-status"

export function NavDropdownMenu() {
  const { t } = useTranslation()
  const { navigate: router, location, params } = useRouterAdapter()
  const [open, setOpen] = useState(false)

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
  const { isKeyboardShortcutsOpen, setKeyboardShortcutsOpen } =
    useAppRuntimeStore()
  const { setIsRightPanelOpen, setCurrentApp } = useSpaceAppStore()
  const { addNode } = useContextNodes()
  const { addApp } = useAppsStore()

  const toggleKeyboardShortcuts = () => {
    setKeyboardShortcutsOpen(!isKeyboardShortcutsOpen)
  }

  const { setCmdkOpen, isCmdkOpen, isEmbeddingModeLoaded } =
    useAppRuntimeStore()
  const { getEmail, enabled } = useVCardEmail()
  const node = useCurrentNode()

  const { createEmbedding } = useHnsw()
  const { experiment } = useExperimentConfigStore()
  const { space } = useCurrentPathInfo()
  const { toast } = useToast()

  // File item actions context
  const fileActionsContext = {
    filePath: filePath || "",
    space,
    navigate: router,
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

  const toggleCMDK = () => {
    setCmdkOpen(!isCmdkOpen)
  }

  const deleteCurrentNode = () => {
    if (node) {
      deleteNode(node)
      router(`/`)
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

        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger asChild>
            <Button size="xs" variant="ghost">
              <MoreHorizontal className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={toggleCMDK}>
                <CommandIcon className="mr-2 h-4 w-4" />
                <span>{t("nav.dropdown.menu.commandPalette")}</span>
                <DropdownMenuShortcut>⌘K</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={toggleKeyboardShortcuts}>
                <Keyboard className="mr-2 h-4 w-4" />
                <span>{t("nav.dropdown.menu.keyboardShortcuts")}</span>
              </DropdownMenuItem>
              {/* <DropdownMenuItem onSelect={goSettings}>
                <CogIcon className="mr-2 h-4 w-4" />
                <span>{t("common.settings")}</span>
              </DropdownMenuItem> */}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <Link to="https://github.com/mayneyao/eidos" target="_blank">
              <DropdownMenuItem>
                <Github className="mr-2 h-4 w-4" />
                <span>GitHub</span>
              </DropdownMenuItem>
            </Link>
            <Link to={URLS.DISCORD_INVITE} target="_blank">
              <DropdownMenuItem>
                <DiscordIcon className="mr-2 h-4 w-4" />
                <span>Discord</span>
              </DropdownMenuItem>
            </Link>
            <Link to={URLS.HOME} target="_blank">
              <DropdownMenuItem>
                <HomeIcon className="mr-2 h-4 w-4" />
                <span>{t("nav.dropdown.menu.website")}</span>
              </DropdownMenuItem>
            </Link>

            {/* View current extension (file-handler or blocks page) */}
            {showViewExtension && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={viewExtension}>
                  <FileCodeIcon className="mr-2 h-4 w-4" />
                  <span>{viewExtensionText}</span>
                </DropdownMenuItem>
              </>
            )}

            {/* Open with submenu (file-handler page with multiple handlers) */}
            {showOpenWith && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <FileIcon className="mr-2 h-4 w-4" />
                    <span>{t("file.menu.openWith", "Open with")}</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {allHandlers.map((handler) => {
                      const meta = handler.meta as FileHandlerMeta
                      return (
                        <DropdownMenuItem
                          key={handler.id}
                          onClick={() => openWith(handler)}
                        >
                          {meta.fileHandler.icon && (
                            <span className="mr-2">
                              {meta.fileHandler.icon}
                            </span>
                          )}
                          {meta.fileHandler.title || handler.name}
                        </DropdownMenuItem>
                      )
                    })}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </>
            )}

            {/* Open file in file manager (file-handler page only) */}
            {isFileHandlerPage && filePath && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={openInFileManager}>
                  <FolderOpen className="mr-2 h-4 w-4" />
                  <span>
                    {t(
                      "nav.dropdown.menu.openInFileManager",
                      "Open in File Manager"
                    )}
                  </span>
                </DropdownMenuItem>
              </>
            )}

            {node && (
              <>
                {node.type === "doc" && !isDayPageId(node.id) && (
                  <>
                    <DropdownMenuItem
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
                    </DropdownMenuItem>
                    <DropdownMenuItem
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
                    </DropdownMenuItem>
                  </>
                )}
                {node.type === "table" && enabled && (
                  <>
                    <DropdownMenuSeparator />
                    <DialogTrigger className="w-full">
                      <DropdownMenuItem>
                        <MailIcon className="mr-2 h-4 w-4" />
                        {t("nav.dropdown.menu.mail")}
                      </DropdownMenuItem>
                    </DialogTrigger>
                  </>
                )}
                <DropdownMenuSeparator />
                <NodeExport node={node} />
                {/* <NodeOpenInCursor
                  node={node}
                  openInPlayground={openInPlayground}
                /> */}
                {node.type === "dataview" && (
                  <DropdownMenuItem onClick={handleAddToPanel}>
                    <PanelRightIcon className="mr-2 h-4 w-4" />
                    {t("node.menu.addToPanel", "Add to Panel")}
                  </DropdownMenuItem>
                )}
                {node.type === "doc" && !isDayPageId(node.id) && (
                  <>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <PackageIcon className="mr-2 h-4 w-4" />
                        {t("node.menu.moveInto")}
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-48">
                        <NodeMoveInto node={node} />
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  </>
                )}
                {!isDayPageId(node.id) && (
                  <DropdownMenuItem onClick={deleteCurrentNode}>
                    <Trash2Icon className="mr-2 h-4 w-4"></Trash2Icon>
                    <span>{t("common.delete")}</span>
                  </DropdownMenuItem>
                )}
                <NodeUpdateTime />
              </>
            )}
            {/* <DropdownMenuSeparator />
            <Link to={URLS.DOWNLOAD} target="_blank">
              <DropdownMenuItem>
                <Download className="mr-2 h-4 w-4" />
                <span>{t("common.download")}</span>
              </DropdownMenuItem>
            </Link>
            <UpdateStatusComponent />
            <span className="p-2 text-sm text-gray-500">
              {t("nav.dropdown.menu.version", {
                version: EIDOS_VERSION,
                mode: isDesktopMode
                  ? t("nav.dropdown.menu.desktop")
                  : t("nav.dropdown.menu.web"),
              })}
            </span> */}
          </DropdownMenuContent>
        </DropdownMenu>
      </Dialog>
    </>
  )
}
