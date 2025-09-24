"use client"

import { useMemo } from "react"
import { ListTreeIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { useAllNodes } from "@/apps/web-app/hooks/use-nodes"
import { useSidebarStore } from "@/apps/web-app/store/sidebar-store"

import { ExtensionSidebar } from "../../pages/[database]/extensions/components/extension-sidebar"
import { FileManager } from "../file-manager"
import { CurrentItemTree } from "./item-tree"

const NodesContent = () => {
  const { t } = useTranslation()
  const { space } = useCurrentPathInfo()
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


export const SidebarContent = () => {
  const { currentApp } = useSidebarStore()

  const renderContent = () => {
    switch (currentApp) {
      case "nodes":
        return <NodesContent />
      case "extensions":
        return <ExtensionsContent />
      default:
        return <NodesContent />
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {renderContent()}
    </div>
  )
}
