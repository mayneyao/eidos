import React, { useEffect } from "react"
import { Plus, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { useTabStore } from "@/apps/web-app/store/tabs"

export function TabBar() {
  const { tabs, activeTabId, openTab, closeTab, setActiveTab } = useTabStore()

  const handleNewTab = () => {
    openTab("/", "New Tab")
  }

  const handleTabClick = (tabId: string, e: React.MouseEvent) => {
    // Middle-click to close
    if (e.button === 1) {
      e.preventDefault()
      closeTab(tabId)
    }
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + W: Close current tab
      if ((e.metaKey || e.ctrlKey) && e.key === "w") {
        e.preventDefault()
        if (activeTabId) {
          closeTab(activeTabId)
        }
      }

      // Cmd/Ctrl + T: New tab
      if ((e.metaKey || e.ctrlKey) && e.key === "t") {
        e.preventDefault()
        handleNewTab()
      }

      // Cmd/Ctrl + Tab: Next tab
      if ((e.metaKey || e.ctrlKey) && e.key === "Tab" && !e.shiftKey) {
        e.preventDefault()
        const currentIndex = tabs.findIndex((t) => t.id === activeTabId)
        const nextIndex = (currentIndex + 1) % tabs.length
        if (tabs[nextIndex]) {
          setActiveTab(tabs[nextIndex].id)
        }
      }

      // Cmd/Ctrl + Shift + Tab: Previous tab
      if ((e.metaKey || e.ctrlKey) && e.key === "Tab" && e.shiftKey) {
        e.preventDefault()
        const currentIndex = tabs.findIndex((t) => t.id === activeTabId)
        const prevIndex =
          currentIndex === 0 ? tabs.length - 1 : currentIndex - 1
        if (tabs[prevIndex]) {
          setActiveTab(tabs[prevIndex].id)
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [tabs, activeTabId, closeTab, setActiveTab])

  return (
    <div
      className="flex items-center gap-1 flex-1 min-w-0"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      id="drag-region"
    >
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={cn(
            "group flex items-center gap-1 px-2 py-1 text-sm cursor-pointer transition-colors max-w-[200px] min-w-[80px] rounded",
            activeTabId === tab.id ? "bg-accent" : "hover:bg-accent/50"
          )}
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          onClick={() => setActiveTab(tab.id)}
          onMouseDown={(e) => handleTabClick(tab.id, e)}
        >
          <span className="truncate flex-1">{tab.title}</span>
          <button
            className="hover:bg-background/80 rounded p-0.5 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
            onClick={(e) => {
              e.stopPropagation()
              closeTab(tab.id)
            }}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
      <button
        className="p-1 hover:bg-accent rounded opacity-60 hover:opacity-100"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        onClick={handleNewTab}
        title="New Tab (Cmd/Ctrl+T)"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  )
}
