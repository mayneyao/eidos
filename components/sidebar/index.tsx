"use client"

import { useEffect, useState } from "react"
import { Database, FileBoxIcon, Files } from "lucide-react"
import { Link } from "react-router-dom"

import { useAppRuntimeStore } from "@/lib/store/runtime-store"
import { cn } from "@/lib/utils"
import { useCurrentNode } from "@/hooks/use-current-node"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useSpace } from "@/hooks/use-space"
import { useSqlite, useSqliteStore } from "@/hooks/use-sqlite"
import { DatabaseSelect } from "@/components/database-select"

import { Button } from "../ui/button"
import { CreateFileDialog } from "./create-file"
import { EverydaySidebarItem } from "./everyday"
import { CurrentItemTree } from "./item-tree"
import { TableListLoading } from "./loading"

export const SideBar = ({ className }: any) => {
  const { space } = useCurrentPathInfo()
  const currentNode = useCurrentNode()
  const [loading, setLoading] = useState(true)
  const { updateNodeList } = useSqlite(space)
  const { allNodes: _allNodes } = useSqliteStore()
  const { spaceList } = useSpace()
  const { isShareMode } = useAppRuntimeStore()
  const allNodes = [..._allNodes].reverse()

  useEffect(() => {
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
              <Link to={databaseHomeLink}>Eidos</Link>
            </h2>
          )} */}
          {isShareMode ? (
            "shareMode"
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
                </>
              )}
              <CurrentItemTree
                title="Tables"
                type="table"
                spaceName={space}
                allNodes={allNodes.filter(
                  (node) => node.type === "table" && !node.parentId
                )}
                isShareMode={isShareMode}
                Icon={<Database className="pr-2" />}
                currentNode={currentNode}
              />
              <CurrentItemTree
                title="Drafts"
                type="doc"
                spaceName={space}
                allNodes={allNodes.filter(
                  (node) => node.type === "doc" && !node.parentId
                )}
                allTableNodes={allNodes.filter(
                  (node) => node.type === "table" && !node.parentId
                )}
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
