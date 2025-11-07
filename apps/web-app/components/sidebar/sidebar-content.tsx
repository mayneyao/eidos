"use client"

import { useMemo } from "react"
import { detectDirective } from "@eidos.space/v3"
import { ListTreeIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useMblock } from "@/apps/web-app/hooks/use-mblock"
import { useAllNodes } from "@/apps/web-app/hooks/use-nodes"
import { useSidebarStore } from "@/apps/web-app/store/sidebar-store"

import { BlockApp } from "../block-renderer/block-app"
import { ExtensionSidebar } from "./extensions"
import { CurrentItemTree } from "./nodes"
import { FilesSidebar } from "./files"

const NodesContent = () => {
  const { t } = useTranslation()
  const allNodes = useAllNodes()

  const combinedNodes = useMemo(() => {
    const pinnedNodes = allNodes.filter((node) => node.is_pinned)
    const regularNodes = allNodes.filter(
      (node) => !node.parent_id && !node.is_deleted && !node.is_pinned
    )
    return [...pinnedNodes, ...regularNodes]
  }, [allNodes])

  // For virtual scrolling, we need all nodes (including children)
  const allNodesForVirtual = useMemo(() => {
    return allNodes.filter((node) => !node.is_deleted)
  }, [allNodes])

  return (
    <div className="flex h-full w-full flex-col">
      <CurrentItemTree
        title={t("common.nodes")}
        allNodes={combinedNodes}
        allNodesForVirtual={allNodesForVirtual}
        Icon={<ListTreeIcon className="pr-1" />}
      />
    </div>
  )
}

const ExtensionsContent = () => {
  return (
    <div className="flex h-full w-full flex-col">
      <ExtensionSidebar />
    </div>
  )
}

const FilesContent = () => {
  return (
    <div className="flex h-full w-full flex-col">
      <FilesSidebar />
    </div>
  )
}

const BlockContent = ({ block }: { block: any }) => {
  const { space } = useCurrentPathInfo()
  if (!block.id) {
    return <div>Block not found</div>
  }
  return <BlockApp url={`block://${block.id}@${space}`} height={"100%"} />
}

export const SidebarContent = () => {
  const { currentApp } = useSidebarStore()
  const block = useMblock(currentApp || "")

  const renderContent = () => {
    switch (currentApp) {
      case "extensions":
        return <ExtensionsContent />
      case "nodes":
        return <NodesContent />
      case "files":
        return <FilesContent />
      default:
        // Check if currentApp is a block ID with 'use sidebar' directive
        if (
          currentApp &&
          !["extensions", "nodes", "today", "files"].includes(currentApp) &&
          block &&
          block.code &&
          detectDirective(block.code, "use sidebar")
        ) {
          return <BlockContent block={block} />
        }
        return <NodesContent />
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {renderContent()}
    </div>
  )
}
