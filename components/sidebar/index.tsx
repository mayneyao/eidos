"use client"

import { useEffect, useState } from "react"
import {
  AppWindowIcon,
  BlocksIcon,
  ClipboardPasteIcon,
  FileBoxIcon,
  ListTreeIcon,
  PinIcon,
} from "lucide-react"
import { Link } from "react-router-dom"
import { useTranslation } from "react-i18next"

import { isDesktopMode } from "@/lib/env"
import { useAppStore } from "@/lib/store/app-store"
import { useAppRuntimeStore } from "@/lib/store/runtime-store"
import { cn } from "@/lib/utils"
import { isMac } from "@/lib/web/helper"
import { useAllExtensions } from "@/hooks/use-all-extensions"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useAllNodes } from "@/hooks/use-nodes"
import { useSpace } from "@/hooks/use-space"
import { useSqlite } from "@/hooks/use-sqlite"
import { Sidebar, SidebarRail } from "@/components/ui/sidebar"
import { DatabaseSelect } from "@/components/database-select"
import { useExperimentConfigStore } from "@/apps/web-app/settings/experiment/store"

import { FileManager } from "../file-manager"
import { SpaceSettings } from "../space-settings"
import { Button } from "../ui/button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "../ui/context-menu"
// import { BackupStatus } from "./backup"
import { EverydaySidebarItem } from "./everyday"
import { ImportFileDialog } from "./import-file"
import { CurrentItemTree } from "./item-tree"
import { TableListLoading } from "./loading"
import { Trash } from "./trash"
import { useTreeOperations } from "./tree/hooks"
import { useFolderStore } from "./tree/store"

export const SideBar = ({ className }: any) => {
  const { t } = useTranslation()
  const { space } = useCurrentPathInfo()
  const [loading, setLoading] = useState(true)
  const { updateNodeList } = useSqlite(space)
  const allNodes = useAllNodes()
  const { spaceList } = useSpace()
  const { isShareMode } = useAppRuntimeStore()
  const { currentCut } = useFolderStore()
  const scripts = useAllExtensions(space)
  const apps = scripts.filter((script) => script.type === "app")

  const { isFileManagerOpen, setFileManagerOpen, setSidebarOpen } =
    useAppStore()

  const toggleFileManager = () => {
    setFileManagerOpen(!isFileManagerOpen)
  }
  const { handlePaste } = useTreeOperations()
  useEffect(() => {
    updateNodeList().then(() => {
      setLoading(false)
    })
  }, [updateNodeList])

  const {
    experiment: { enableFileManager },
  } = useExperimentConfigStore()
  return (
    <Sidebar>
      <SidebarRail />
      <div
        className={cn("flex flex-col h-full shrink-0", {
          "pt-8":
            isMac() &&
            (isDesktopMode || navigator.windowControlsOverlay?.visible),
        })}
      >
        {!isDesktopMode && isFileManagerOpen ? (
          <FileManager />
        ) : (
          <div className={cn("flex h-full flex-col gap-2 p-2", className)}>
            <div className="flex items-center justify-between">
              {isShareMode ? (
                t("common.shareMode")
              ) : (
                <>
                  <DatabaseSelect databases={spaceList} />
                </>
              )}
            </div>
            <div className="flex h-full w-full flex-col justify-between overflow-y-auto">
              {loading ? (
                <TableListLoading />
              ) : (
                <div>
                  {!isShareMode && (
                    <>
                      <EverydaySidebarItem space={space} />
                      {enableFileManager && !isDesktopMode && (
                        <Button
                          variant={"ghost"}
                          size="sm"
                          onClick={toggleFileManager}
                          className="w-full justify-start font-normal"
                        >
                          <FileBoxIcon className="pr-2" />
                          {t("common.files")}
                        </Button>
                      )}
                      <Button
                        variant={"ghost"}
                        size="sm"
                        className="w-full justify-start font-normal"
                        asChild
                      >
                        <Link to={`/${space}/extensions`}>
                          <BlocksIcon className="pr-2" />
                          {t("common.extensions")}
                        </Link>
                      </Button>
                      <CurrentItemTree
                        title={t("common.pinned")}
                        allNodes={allNodes.filter((node) => node.is_pinned)}
                        Icon={<PinIcon className="pr-2" />}
                        disableAdd
                      />
                    </>
                  )}
                  <ContextMenu>
                    <ContextMenuTrigger>
                      <CurrentItemTree
                        title={t("common.nodes")}
                        allNodes={allNodes.filter(
                          (node) => !node.parent_id && !node.is_deleted
                        )}
                        Icon={<ListTreeIcon className="pr-2" />}
                      />
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem
                        onClick={() => handlePaste()}
                        disabled={!currentCut}
                      >
                        <ClipboardPasteIcon className="pr-2" />
                        {t("common.paste")}
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                  {apps.map((app) => (
                    <Button
                      variant={"ghost"}
                      size="sm"
                      key={app.id}
                      className="w-full justify-start font-normal"
                      asChild
                    >
                      <Link to={`/${space}/apps/${app.id}`}>
                        <AppWindowIcon className="pr-2" />
                        {app.name}
                      </Link>
                    </Button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <Trash />
              <ImportFileDialog />
              <SpaceSettings />
            </div>
          </div>
        )}
      </div>
    </Sidebar>
  )
}
