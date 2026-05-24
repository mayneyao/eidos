import React from "react"
import { TreeNodeType } from "@/packages/core/types/ITreeNode"
import {
  LockIcon,
  LockOpenIcon,
  MoveHorizontal,
  SplitSquareHorizontal,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { isDayPageId } from "@/lib/utils"
import { useSqlite } from "@/hooks/use-sqlite"
import {
  NativeContextMenu as ContextMenu,
  NativeContextMenuCheckboxItem as ContextMenuCheckboxItem,
  NativeContextMenuContent as ContextMenuContent,
  NativeContextMenuItem as ContextMenuItem,
  NativeContextMenuSeparator as ContextMenuSeparator,
  NativeContextMenuShortcut as ContextMenuShortcut,
  NativeContextMenuTrigger as ContextMenuTrigger,
} from "@/components/ui/native-context-menu"
import { useTabContextMenuItems } from "@/hooks/use-tab-context-menu-registry"
import { NodeUpdateTime } from "@/components/nav/node-update-time"

import { useNodeMap } from "@/apps/web-app/hooks/use-current-node"
import { useTabStore } from "@/apps/web-app/store/tabs"

import {
  CopyTableSchemaContextMenu,
  NodeExportContextMenu,
} from "../node-menu/node-export"

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
  const panels = useTabStore((state) => state.panels)
  const splitTab = useTabStore((state) => state.splitTab)

  const isOnlyTab = totalTabs === 1
  // Check if we can split (max 4 panels)
  const canSplit = panels.length < 4
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
        } else if (parts[0] === "folder") {
          // /folder - no additional params
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

  const { toggleNodeFullWidth, toggleNodeLock } = useSqlite()

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

  const registeredItems = useTabContextMenuItems(tabUrl)

  return (
    <>
      {/* Key forces remount when tab or file type changes, ensuring fresh menu registrations */}
      <ContextMenu key={`${tabId}-${tabUrl}`}>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          {/* Tab Operations */}
          <ContextMenuItem onClick={onClose}>
            Close
            <ContextMenuShortcut>Command+W</ContextMenuShortcut>
          </ContextMenuItem>

          <ContextMenuItem onClick={onCloseOthers} disabled={isOnlyTab}>
            Close Others
          </ContextMenuItem>

          <ContextMenuItem onClick={onCloseToRight} disabled={isLastTab}>
            Close Tabs to the Right
          </ContextMenuItem>

          <ContextMenuItem onClick={onCloseAll}>Close All</ContextMenuItem>

          {/* Registered items from pages */}
          {registeredItems.length > 0 && (
            <>
              <ContextMenuSeparator />
              {registeredItems.map((item) =>
                item.render ? (
                  <React.Fragment key={item.id}>{item.render()}</React.Fragment>
                ) : (
                  <ContextMenuItem key={item.id} onClick={item.onClick}>
                    {item.Icon && <item.Icon className="mr-2 h-4 w-4" />}
                    <span>{item.label}</span>
                  </ContextMenuItem>
                )
              )}
            </>
          )}

          {/* Split View Options */}
          <ContextMenuSeparator />
          <ContextMenuItem
            onClick={() => splitTab(tabId, "right")}
            disabled={!canSplit}
          >
            <SplitSquareHorizontal className="mr-2 h-4 w-4" />
            {t("tab.menu.splitRight", "Split Right")}
          </ContextMenuItem>
          {/* Split Down hidden for now
          <ContextMenuItem
            onClick={() => splitTab(tabId, "down")}
            disabled={!canSplit}
          >
            <SplitSquareVertical className="mr-2 h-4 w-4" />
            {t("tab.menu.splitDown", "Split Down")}
          </ContextMenuItem>
          */}

          {/* Node-specific operations */}
          {node && (
            <>
              {node.type === "doc" && !isDayPageId(node.id) && (
                <>
                  <ContextMenuSeparator />
                  <ContextMenuCheckboxItem
                    checked={node.is_full_width}
                    onCheckedChange={() => toggleNodeFullWidth(node)}
                  >
                    <MoveHorizontal className="mr-2 h-4 w-4" />
                    {t("nav.dropdown.menu.fullWidth")}
                  </ContextMenuCheckboxItem>
                  <ContextMenuCheckboxItem
                    checked={node.is_locked}
                    onCheckedChange={() => toggleNodeLock(node)}
                  >
                    {node.is_locked ? (
                      <LockIcon className="mr-2 h-4 w-4" />
                    ) : (
                      <LockOpenIcon className="mr-2 h-4 w-4" />
                    )}
                    {t("nav.dropdown.menu.lock")}
                  </ContextMenuCheckboxItem>
                </>
              )}
              {node.type === "table" && (
                <>
                  <ContextMenuSeparator />
                  <CopyTableSchemaContextMenu node={node} />
                </>
              )}
              <ContextMenuSeparator />
              <NodeExportContextMenu node={node} />
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
              <NodeUpdateTime />
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>
    </>
  )
}
