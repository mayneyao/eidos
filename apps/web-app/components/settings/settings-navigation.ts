import type { Panel, Tab, TabHistoryEntry } from "@/apps/web-app/store/tabs"

interface TabHistoryState {
  entries: TabHistoryEntry[]
  index: number
}

export interface SettingsNavigationState {
  tabs: Tab[]
  panels: Panel[]
  activePanelId: string | null
  activeTabId: string | null
  history: Record<string, TabHistoryState>
}

export type BackToAppTarget =
  | { type: "history"; tabId: string; delta: number }
  | { type: "tab"; tabId: string }
  | { type: "home" }

export function isSettingsUrl(url: string): boolean {
  try {
    const pathname = new URL(url, "https://eidos.local").pathname
    return pathname === "/settings" || pathname.startsWith("/settings/")
  } catch {
    return false
  }
}

function mostRecentAppTab(tabs: Tab[]): Tab | undefined {
  return tabs
    .filter((tab) => !isSettingsUrl(tab.url))
    .sort((left, right) => right.lastAccessTime - left.lastAccessTime)[0]
}

export function resolveBackToAppTarget({
  tabs,
  panels,
  activePanelId,
  activeTabId,
  history,
}: SettingsNavigationState): BackToAppTarget {
  const activePanel = panels.find((panel) => panel.id === activePanelId)
  const panelTabs = activePanel
    ? activePanel.tabIds
        .filter((tabId) => tabId !== activeTabId)
        .map((tabId) => tabs.find((tab) => tab.id === tabId))
        .filter((tab): tab is Tab => Boolean(tab))
    : []
  const panelTarget = mostRecentAppTab(panelTabs)
  if (panelTarget) return { type: "tab", tabId: panelTarget.id }

  const globalTarget = mostRecentAppTab(
    tabs.filter((tab) => tab.id !== activeTabId)
  )
  if (globalTarget) return { type: "tab", tabId: globalTarget.id }

  if (activeTabId) {
    const activeHistory = history[activeTabId]
    if (activeHistory) {
      for (let index = activeHistory.index - 1; index >= 0; index -= 1) {
        if (!isSettingsUrl(activeHistory.entries[index]?.url ?? "")) {
          return {
            type: "history",
            tabId: activeTabId,
            delta: index - activeHistory.index,
          }
        }
      }
    }
  }

  return { type: "home" }
}
