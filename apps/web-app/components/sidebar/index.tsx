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
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { isDesktopMode } from "@/lib/env"
import { cn } from "@/lib/utils"
import { isMac, isMacDesktop } from "@/lib/web/helper"
import { Sidebar, SidebarRail } from "@/components/ui/sidebar"
import { DatabaseSelect } from "@/components/database-select"
import { useAllExtensions } from "@/apps/web-app/hooks/use-all-extensions"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { useAllNodes } from "@/apps/web-app/hooks/use-nodes"
import { useSpace } from "@/apps/web-app/hooks/use-space"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { useExperimentConfigStore } from "@/apps/web-app/pages/settings/experiment/store"
import { useAppStore } from "@/apps/web-app/store/app-store"
import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"

import { FileManager } from "../file-manager"
import { NavigationControls } from "../navigation-controls"
import { SpaceSettings } from "../space-settings"
import { Button } from "../ui/button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "../ui/context-menu"
import { EverydaySidebarItem } from "./everyday"
import { ImportFileDialog } from "./import-file"
import { CurrentItemTree } from "./item-tree"
import { TableListLoading } from "./loading"
import { MicroBlocksGrid } from "./micro-blocks-grid"
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
  const scripts = useAllExtensions()

  const { isFileManagerOpen, setFileManagerOpen } = useAppStore()

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
        className={cn("absolute top-[5px] right-3", {
          hidden: !isMacDesktop,
        })}
      >
        <NavigationControls />
      </div>
      <div
        className={cn("flex flex-col h-full shrink-0 select-none", {
          "pt-8":
            isMac() &&
            (isDesktopMode || navigator.windowControlsOverlay?.visible),
        })}
      >
        {!isDesktopMode && isFileManagerOpen ? (
          <FileManager />
        ) : (
          <div className={cn("flex h-full flex-col p-2", className)}>
            <div className="flex items-center justify-between">
              {isShareMode ? t("common.shareMode") : <div className="w-full" />}
            </div>
            <MicroBlocksGrid />
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
                          <FileBoxIcon className="pr-1" />
                          {t("common.files")}
                        </Button>
                      )}
                      <Button
                        variant={"ghost"}
                        size="sm"
                        className="w-full justify-start font-normal"
                        asChild
                      >
                        <Link
                          to={`/${space}/extensions`}
                          className="[&>svg]:!size-5"
                        >
                          <BlocksIcon className="pr-1" />
                          {t("common.extensions")}
                        </Link>
                      </Button>
                      {/* Blocks Grid */}
                      <CurrentItemTree
                        title={t("common.pinned")}
                        allNodes={allNodes.filter((node) => node.is_pinned)}
                        Icon={<PinIcon className="pr-1" />}
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
                        Icon={<ListTreeIcon className="pr-1" />}
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
                </div>
              )}
            </div>
            <div>
              <Trash />
              <ImportFileDialog />
              <div className="flex items-center justify-between gap-1">
                {!isShareMode && <DatabaseSelect databases={spaceList} />}
                <SpaceSettings />
              </div>
            </div>
          </div>
        )}
      </div>
    </Sidebar>
  )
}
