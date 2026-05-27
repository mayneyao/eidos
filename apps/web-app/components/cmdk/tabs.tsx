import { PanelsTopLeft, X } from "lucide-react"
import { useTranslation } from "react-i18next"

import {
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"
import { useTabStore } from "@/apps/web-app/store/tabs"

export const TabCommandItems = () => {
  const {
    tabs,
    panels,
    activePanelId,
    setActiveTab,
    confirmCloseTab,
    getPanelForTab,
  } = useTabStore()
  const { setCmdkOpen } = useAppRuntimeStore()
  const { t } = useTranslation()

  const handleSwitchTab = (tabId: string) => {
    setActiveTab(tabId)
    setCmdkOpen(false)
  }

  const handleCloseTab = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation()
    confirmCloseTab(tabId)
  }

  const activeTabId =
    panels.find((p) => p.id === activePanelId)?.activeTabId ?? null

  if (!tabs.length) return null

  return (
    <>
      <CommandGroup heading={t("cmdk.tabs", "Tabs")}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId
          const panel = getPanelForTab(tab.id)
          const panelIndex = panel
            ? panels.findIndex((p) => p.id === panel.id) + 1
            : undefined

          return (
            <CommandItem
              key={tab.id}
              onSelect={() => handleSwitchTab(tab.id)}
              value={`tab ${tab.title} ${tab.url}`}
              className="group"
            >
              <PanelsTopLeft
                className={`mr-2 h-4 w-4 ${isActive ? "text-primary" : ""}`}
              />
              <span className="truncate flex-1">{tab.title}</span>
              {panelIndex !== undefined && panels.length > 1 && (
                <span className="ml-2 text-xs text-muted-foreground">
                  P{panelIndex}
                </span>
              )}
              {isActive && (
                <span className="ml-2 text-xs text-primary">
                  {t("cmdk.tabs.active", "Active")}
                </span>
              )}
              <CommandShortcut>
                {t("cmdk.tabs.switch", "Switch")}
              </CommandShortcut>
              <button
                className="ml-2 rounded p-0.5 opacity-0 hover:bg-accent hover:opacity-100 group-hover:opacity-60"
                onClick={(e) => handleCloseTab(e, tab.id)}
                title={t("cmdk.tabs.close", "Close tab")}
              >
                <X className="h-3 w-3" />
              </button>
            </CommandItem>
          )
        })}
      </CommandGroup>
      <CommandSeparator />
    </>
  )
}
