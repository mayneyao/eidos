"use client"

import { useEffect, useState } from "react"
import {
  BlocksIcon,
  Database,
  FileBoxIcon,
  FileCodeIcon,
  Files,
  PinIcon,
} from "lucide-react"
import { Link } from "react-router-dom"

import { useAppRuntimeStore } from "@/lib/store/runtime-store"
import { cn } from "@/lib/utils"
import { useCurrentNode } from "@/hooks/use-current-node"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useAllNodes } from "@/hooks/use-nodes"
import { useSpace } from "@/hooks/use-space"
import { useSqlite } from "@/hooks/use-sqlite"
import { Separator } from "@/components/ui/separator"
import { DatabaseSelect } from "@/components/database-select"
import { useConfigStore } from "@/app/settings/store"

import { Button } from "../ui/button"
import { BackupStatus } from "./backup"
import { EverydaySidebarItem } from "./everyday"
import { ImportFileDialog } from "./import-file"
import { CurrentItemTree } from "./item-tree"
import { TableListLoading } from "./loading"
import { Trash } from "./trash"

export const SideBar = ({ className }: any) => {
  const { space } = useCurrentPathInfo()
  const currentNode = useCurrentNode()
  const [loading, setLoading] = useState(true)
  const { updateNodeList } = useSqlite(space)
  const allNodes = useAllNodes()
  const { spaceList } = useSpace()
  const { isShareMode } = useAppRuntimeStore()

  useEffect(() => {
    updateNodeList().then(() => {
      setLoading(false)
    })
  }, [updateNodeList])

  const {
    experiment: { enableFileManager },
  } = useConfigStore()

  return (
    <>
      <div className={cn("flex h-full flex-col p-4", className)}>
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
        <div className="flex h-full flex-col justify-between overflow-y-auto">
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
                    type="table"
                    allNodes={allNodes.filter((node) => node.is_pinned)}
                    Icon={<PinIcon className="pr-2" />}
                    disableAdd
                  />
                </>
              )}
              <CurrentItemTree
                title="Tables"
                type="table"
                allNodes={allNodes.filter(
                  (node) => node.type === "table" && !node.parent_id
                )}
                Icon={<Database className="pr-2" />}
              />
              <CurrentItemTree
                title="Drafts"
                type="doc"
                allNodes={allNodes.filter(
                  (node) => node.type === "doc" && !node.parent_id
                )}
                Icon={<Files className="pr-2" />}
              />
            </div>
          )}
          <div>
            <Trash />
            <ImportFileDialog />
            <Separator />
            <BackupStatus />
          </div>
        </div>
      </div>
    </>
  )
}
