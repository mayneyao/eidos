import React from "react"
import { X } from "lucide-react"

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"

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
  const isOnlyTab = totalTabs === 1
  const isLastTab = tabIndex >= totalTabs - 1

  // Debug logging
  console.log("TabContextMenu:", { tabId, tabIndex, totalTabs, isLastTab })

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={onClose}>
          Close
          <ContextMenuShortcut>⌘W</ContextMenuShortcut>
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem onClick={onCloseOthers} disabled={isOnlyTab}>
          Close Others
        </ContextMenuItem>

        <ContextMenuItem onClick={onCloseToRight} disabled={isLastTab}>
          Close Tabs to the Right
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem onClick={onCloseAll}>Close All</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
