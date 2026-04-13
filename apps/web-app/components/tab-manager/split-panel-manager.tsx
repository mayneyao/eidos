import React from "react"

import { cn } from "@/lib/utils"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import type { Panel } from "@/apps/web-app/store/tabs"
import { useTabStore } from "@/apps/web-app/store/tabs"

import { TabBar } from "./tab-bar"
import { TabContainer } from "./tab-container"

interface PanelViewProps {
  panel: Panel
  isActive: boolean
  isFirst: boolean
  isLast: boolean
  showTabBar?: boolean
  children: React.ReactNode
}

function PanelView({
  panel,
  isActive,
  isFirst,
  isLast,
  showTabBar = true,
  children,
}: PanelViewProps) {
  const { tabs, setActivePanel } = useTabStore()
  const panelTabs = panel.tabIds
    .map((id) => tabs.find((t) => t.id === id))
    .filter((t): t is NonNullable<typeof t> => t !== undefined)

  const handlePanelClick = () => {
    if (!isActive) {
      setActivePanel(panel.id)
    }
  }

  return (
    <div
      className={cn(
        "flex flex-col h-full w-full",
        isActive ? "ring-1 ring-primary/30" : "opacity-90"
      )}
      onClick={handlePanelClick}
    >
      {/* Panel-specific TabBar - hidden when Nav renders it (single panel) */}
      {showTabBar && (
        <TabBar
          panelId={panel.id}
          isFirstPanel={isFirst}
          isLastPanel={isLast}
        />
      )}

      {/* Tab content area */}
      <div className="relative flex-1 min-h-0">
        {panelTabs.map((tab) => {
          const isTabActive = panel.activeTabId === tab.id
          return (
            <TabContainer
              key={tab.id}
              tabId={tab.id}
              initialUrl={tab.url || "/"}
              isActive={isTabActive}
            >
              {children}
            </TabContainer>
          )
        })}
      </div>
    </div>
  )
}

interface SplitPanelManagerProps {
  children: React.ReactNode
}

export function SplitPanelManager({ children }: SplitPanelManagerProps) {
  const { panels, activePanelId, splitDirection } = useTabStore()

  // No panels at all - this shouldn't happen normally
  if (panels.length === 0) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center text-muted-foreground">
        No tabs open
      </div>
    )
  }

  // Always use ResizablePanelGroup to maintain stable component tree structure
  // This prevents TabContainer remounting when switching between single and multiple panels
  const isMultiPanel = panels.length > 1

  return (
    <ResizablePanelGroup direction={splitDirection} className="h-full w-full">
      {panels.map((panel, index) => (
        <React.Fragment key={panel.id}>
          {index > 0 && (
            <ResizableHandle className="hover:cursor-col-resize w-[3px] bg-border hover:bg-primary/50 transition-colors" />
          )}
          <ResizablePanel minSize={20}>
            <PanelView
              panel={panel}
              isActive={panel.id === activePanelId}
              isFirst={index === 0}
              isLast={index === panels.length - 1}
              showTabBar={isMultiPanel}
            >
              {children}
            </PanelView>
          </ResizablePanel>
        </React.Fragment>
      ))}
    </ResizablePanelGroup>
  )
}
