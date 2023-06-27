"use client"

import { useEffect, useState } from "react"
import { Database, Files } from "lucide-react"

import { useAppRuntimeStore } from "@/lib/store/runtime-store"
import { cn } from "@/lib/utils"
import { useCurrentNode } from "@/hooks/use-current-node"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useSpace } from "@/hooks/use-space"
import { useSqlite, useSqliteStore } from "@/hooks/use-sqlite"
import { Separator } from "@/components/ui/separator"
import { DatabaseSelect } from "@/components/database-select"

import { CreateFileDialog } from "./create-file"
import { EverydaySidebarItem } from "./everyday"
import { CurrentItemTree } from "./item-tree"
import { TableListLoading } from "./loading"

export const SideBar = ({ className }: any) => {
  const { space } = useCurrentPathInfo()
  const currentNode = useCurrentNode()
  const [loading, setLoading] = useState(true)
  const { updateNodeList } = useSqlite(space)
  const { allNodes } = useSqliteStore()
  const { spaceList } = useSpace()
  const { isShareMode } = useAppRuntimeStore()

  useEffect(() => {
    console.log("side bar loading all tables ")
    updateNodeList().then(() => {
      setLoading(false)
    })
  }, [updateNodeList])

  return (
    <>
      <div className={cn("flex h-full flex-col p-4", className)}>
        <div className="flex items-center justify-between">
          {/* {!isShareMode && (
            <h2 className="relative px-6 text-lg font-semibold tracking-tight">
              <Link href={databaseHomeLink}>Eidos</Link>
            </h2>
          )} */}
          {isShareMode ? (
            "shareMode"
          ) : (
            <>
              <DatabaseSelect databases={spaceList} defaultValue={space} />
            </>
          )}
        </div>
        <Separator className="my-2" />
        <div className="flex h-full flex-col justify-between overflow-y-auto">
          {loading ? (
            <TableListLoading />
          ) : (
            <div>
              {!isShareMode && <EverydaySidebarItem space={space} />}
              <CurrentItemTree
                title="Tables"
                type="table"
                spaceName={space}
                allNodes={allNodes.filter((node) => node.type === "table")}
                isShareMode={isShareMode}
                Icon={<Database className="pr-2" />}
                currentNode={currentNode}
              />
              <CurrentItemTree
                title="Documents"
                type="doc"
                spaceName={space}
                allNodes={allNodes.filter((node) => node.type === "doc")}
                isShareMode={isShareMode}
                currentNode={currentNode}
                Icon={<Files className="pr-2" />}
              />
            </div>
          )}
          <CreateFileDialog />
        </div>
      </div>
    </>
  )
}
