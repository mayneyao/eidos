import React, { useEffect } from "react"
import { DndProvider } from "react-dnd"
import { HTML5Backend } from "react-dnd-html5-backend"

import { ITreeNode } from "@/lib/store/ITreeNode"
import { useAllNodes } from "@/hooks/use-nodes"
import { useTabStore } from "@/hooks/use-tabs"

import { Card } from "./sidebar/tree/card"
import { NodeTreeContainer } from "./sidebar/tree/node-tree"

export const TabManager: React.FC = () => {
  const {
    currentTab,
    openTabs,
    openTab,
    closeTab,
    switchTab,
    setTabs,
    setCurrentTab,
  } = useTabStore()
  const allNodes = useAllNodes()

  useEffect(() => {
    const handleTabsUpdated = (tabs: string[]) => {
      setTabs(new Set(tabs))
    }

    const handleCurrentTabUpdated = (tab: string) => {
      setCurrentTab(tab)
    }

    window.eidos.on("tabs-updated", (event, tabs: string[]) => {
      console.log("tabs-updated", tabs)
      handleTabsUpdated(tabs)
    })
    window.eidos.on("current-tab-updated", (event, tab: string) => {
      console.log("current-tab-updated", tab)
      handleCurrentTabUpdated(tab)
    })

    return () => {
      window.eidos.off("tabs-updated", (event, tabs: string[]) =>
        handleTabsUpdated(tabs)
      )
      window.eidos.off("current-tab-updated", (event, tab: string) =>
        handleCurrentTabUpdated(tab)
      )
    }
  }, [setTabs, setCurrentTab])
  const tabNodes = Array.from(openTabs)
    .map((tab) => {
      const node = allNodes.find(
        (node) => node.id === new URL(tab).pathname.split("/").pop()
      )
      return node
    })
    .filter((node) => node !== undefined) as ITreeNode[]

  return (
    <DndProvider backend={HTML5Backend} context={window}>
      {tabNodes.map((node, index) => (
        <Card
          depth={0}
          key={node.id}
          index={index}
          id={node.id}
          setTarget={() => {}}
          setTargetFolderId={() => {}}
          onDrop={() => {}}
          node={node}
        />
      ))}
    </DndProvider>
  )
}
