"use client"

import {
  AppWindowIcon,
  BlocksIcon,
  FileBoxIcon,
  ListTreeIcon,
  PinIcon
} from "lucide-react"
import { useEffect, useState } from "react"
import { Link } from "react-router-dom"

import { useExperimentConfigStore } from "@/app/settings/experiment/store"
import { DatabaseSelect } from "@/components/database-select"
import { Separator } from "@/components/ui/separator"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useAllNodes } from "@/hooks/use-nodes"
import { useScripts } from "@/hooks/use-scripts"
import { useSpace } from "@/hooks/use-space"
import { useSqlite } from "@/hooks/use-sqlite"
import { useAppRuntimeStore } from "@/lib/store/runtime-store"
import { cn } from "@/lib/utils"

import { Button } from "../ui/button"
import { ScrollArea } from "../ui/scroll-area"
import { BackupStatus } from "./backup"
import { EverydaySidebarItem } from "./everyday"
import { ImportFileDialog } from "./import-file"
import { CurrentItemTree } from "./item-tree"
import { TableListLoading } from "./loading"
import { Trash } from "./trash"

export const SideBar = ({ className }: any) => {
  const { space } = useCurrentPathInfo()
  const [loading, setLoading] = useState(true)
  const { updateNodeList } = useSqlite(space)
  const allNodes = useAllNodes()
  const { spaceList } = useSpace()
  const { isShareMode } = useAppRuntimeStore()
  const scripts = useScripts(space)
  const apps = scripts.filter((script) => script.type === "app")

  useEffect(() => {
    updateNodeList().then(() => {
      setLoading(false)
    })
  }, [updateNodeList])

  const {
    experiment: { enableFileManager },
  } = useExperimentConfigStore()

  return (
    <>
      <div className={cn("flex h-full flex-col p-2", className)}>
        <div className="flex items-center justify-between">
          {/* {!isShareMode && (
            <h2 className="relative px-6 text-lg font-semibold tracking-tight">
              <Link to={databaseHomeLink}>Eidos</Link>
            </h2>
          )} */}
          {isShareMode ? (
            "ShareMode"
          ) : (
            <>
              <DatabaseSelect databases={spaceList} />
            </>
          )}
        </div>
        <div className="my-2" />
        <ScrollArea className="flex h-full max-w-[300px] flex-col justify-between overflow-y-auto">
          {loading ? (
            <TableListLoading />
          ) : (
            <div>
              {!isShareMode && (
                <>
                  <EverydaySidebarItem space={space} />
                  {enableFileManager && (
                    <Button
                      variant={"ghost"}
                      size="sm"
                      className="w-full justify-start font-normal"
                      asChild
                    >
                      <Link to={`/${space}/opfs`}>
                        <FileBoxIcon className="pr-2" />
                        Files
                      </Link>
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
                      Extensions
                    </Link>
                  </Button>
                  <CurrentItemTree
                    title="Pins"
                    allNodes={allNodes.filter((node) => node.is_pinned)}
                    Icon={<PinIcon className="pr-2" />}
                    disableAdd
                  />
                </>
              )}
              {/* <ContextMenu>
                <ContextMenuTrigger> */}
              <CurrentItemTree
                title="Nodes"
                allNodes={allNodes.filter(
                  (node) => !node.parent_id && !node.is_deleted
                )}
                Icon={<ListTreeIcon className="pr-2" />}
              />
              {/* </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem>new doc</ContextMenuItem>
                  <ContextMenuItem>new table</ContextMenuItem>
                  <ContextMenuItem>new folder</ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu> */}

              {/* <CurrentItemTree
                title="Drafts"
                type="doc"
                allNodes={allNodes.filter(
                  (node) => node.type === "doc" && !node.parent_id
                )}
                Icon={<Files className="pr-2" />}
              /> */}
              {/* apps */}
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
        </ScrollArea>
        <div>
          <Trash />
          <ImportFileDialog />
          <Separator />
          <BackupStatus />
        </div>
      </div>
    </>
  )
}
