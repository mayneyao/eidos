import { FileText } from "lucide-react"
import { useEffect, useState } from "react"

import type { Tab} from "@/apps/web-app/store/tabs";
import { useTabStore } from "@/apps/web-app/store/tabs"
import { useSidebarStore } from "@/apps/web-app/store/sidebar-store"
import { cn } from "@/lib/utils"

export function TabSwitcher() {
  const { tabs, activeTabId, setActiveTab } = useTabStore()
  const { setCurrentApp } = useSidebarStore()
  const [isOpen, setIsOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [mruTabs, setMruTabs] = useState<Tab[]>([])

  const locateTabInFileTree = (tabId: string) => {
    const tab = tabs.find(t => t.id === tabId)
    if (!tab) return

    // Check if this is a file-handler page
    if (tab.url.startsWith('/file-handler#')) {
      const filePath = decodeURIComponent(tab.url.substring('/file-handler#'.length))

      // Switch to files tab first to ensure the file tree is mounted
      setCurrentApp("files")

      // Wait a bit for the tab to switch and component to mount
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("file-tree-expand-to", {
            detail: { path: filePath },
          })
        )
      }, 50)
    }
  }

  // Use tabs in their natural order
  useEffect(() => {
    if (isOpen) {
      setMruTabs(tabs)
      // Start with the currently active tab
      const activeIndex = tabs.findIndex(tab => tab.id === activeTabId)
      setSelectedIndex(activeIndex >= 0 ? activeIndex : 0)
    }
  }, [isOpen, tabs, activeTabId])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if Ctrl is pressed
      if (!e.ctrlKey && !e.metaKey) return

      if (e.key === "Tab") {
        e.preventDefault()
        e.stopPropagation()

        if (!isOpen) {
          setIsOpen(true)
          // Initial selection logic is handled in the effect above
        } else {
          // Cycle through tabs
          setSelectedIndex((prev) => {
            const direction = e.shiftKey ? -1 : 1
            const nextIndex = prev + direction

            if (nextIndex < 0) return mruTabs.length - 1
            if (nextIndex >= mruTabs.length) return 0
            return nextIndex
          })
        }
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Control" || e.key === "Meta") {
        if (isOpen) {
          const selectedTab = mruTabs[selectedIndex]
          if (selectedTab) {
            setActiveTab(selectedTab.id)
            locateTabInFileTree(selectedTab.id)
          }
          setIsOpen(false)
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleKeyUp)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("keyup", handleKeyUp)
    }
  }, [isOpen, mruTabs, selectedIndex, setActiveTab])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/20">
      <div className="w-[400px] max-h-[60vh] flex flex-col bg-popover border rounded-lg shadow-xl overflow-hidden">
        <div className="px-3 py-1.5 border-b bg-muted/50 text-xs font-medium text-muted-foreground">
          Open Tabs
        </div>
        <div className="flex-1 overflow-y-auto p-1 space-y-0.5">
          {mruTabs.map((tab, index) => (
            <div
              key={tab.id}
              className={cn(
                "flex items-center gap-2 px-2 py-1.5 rounded-md text-sm cursor-pointer transition-colors",
                index === selectedIndex
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent/50 text-muted-foreground"
              )}
              onClick={() => {
                setActiveTab(tab.id)
                locateTabInFileTree(tab.id)
                setIsOpen(false)
              }}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <FileText className="h-3.5 w-3.5 shrink-0 opacity-70" />
              <div className="flex items-baseline gap-2 min-w-0 flex-1">
                <span className="font-medium truncate text-xs">
                  {tab.title}
                </span>
                <span className="text-[10px] text-muted-foreground truncate opacity-50 flex-1 text-right">
                  {tab.url}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
