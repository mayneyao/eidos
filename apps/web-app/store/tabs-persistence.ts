import { nanoid } from "nanoid"

import type { ClosedTab, Panel, Tab, TabHistoryEntry } from "./tabs"

export const TAB_STORAGE_VERSION = 1

export interface PersistedTabState {
  tabs: Tab[]
  panels: Panel[]
  activePanelId: string | null
  history: Record<string, { entries: TabHistoryEntry[]; index: number }>
  closedTabsStack: ClosedTab[]
  splitDirection: "horizontal" | "vertical"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function persistedTabs(value: unknown): Tab[] {
  if (!Array.isArray(value)) return []
  const ids = new Set<string>()
  return value.filter((tab): tab is Tab => {
    if (
      !isRecord(tab) ||
      typeof tab.id !== "string" ||
      !tab.id ||
      ids.has(tab.id)
    ) {
      return false
    }
    ids.add(tab.id)
    return true
  })
}

function persistedClosedTabs(value: unknown): ClosedTab[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (tab): tab is ClosedTab =>
      isRecord(tab) &&
      typeof tab.url === "string" &&
      typeof tab.title === "string"
  )
}

function persistedHistory(
  value: unknown,
  tabIds: ReadonlySet<string>
): PersistedTabState["history"] {
  if (!isRecord(value)) return {}

  const history: PersistedTabState["history"] = {}
  for (const [tabId, candidate] of Object.entries(value)) {
    if (
      !tabIds.has(tabId) ||
      !isRecord(candidate) ||
      !Array.isArray(candidate.entries)
    ) {
      continue
    }
    const entries = candidate.entries.filter(
      (entry): entry is TabHistoryEntry =>
        isRecord(entry) &&
        typeof entry.key === "string" &&
        typeof entry.url === "string"
    )
    const requestedIndex =
      typeof candidate.index === "number" && Number.isInteger(candidate.index)
        ? candidate.index
        : entries.length - 1
    history[tabId] = {
      entries,
      index:
        entries.length === 0
          ? -1
          : Math.min(Math.max(requestedIndex, 0), entries.length - 1),
    }
  }
  return history
}

/**
 * Normalize both the legacy single-panel tab payload and the current split
 * panel payload before it is merged into the live Zustand store. Persist's
 * migrate hook must do this work: onRehydrateStorage runs too late when a
 * stored version differs and Zustand has already rejected the payload.
 */
export function normalizePersistedTabState(
  persistedState: unknown
): PersistedTabState {
  const state = isRecord(persistedState) ? persistedState : {}
  const tabs = persistedTabs(state.tabs)
  const tabIds = new Set(tabs.map((tab) => tab.id))
  const assignedTabIds = new Set<string>()
  const panelIds = new Set<string>()
  let panels: Panel[] = []

  if (Array.isArray(state.panels)) {
    for (const candidate of state.panels) {
      if (
        !isRecord(candidate) ||
        typeof candidate.id !== "string" ||
        !candidate.id ||
        panelIds.has(candidate.id)
      ) {
        continue
      }
      panelIds.add(candidate.id)
      const candidateAssignedTabIds = new Set<string>()
      const candidateTabIds: string[] = []
      if (Array.isArray(candidate.tabIds)) {
        for (const tabId of candidate.tabIds) {
          if (
            typeof tabId !== "string" ||
            !tabIds.has(tabId) ||
            assignedTabIds.has(tabId) ||
            candidateAssignedTabIds.has(tabId)
          ) {
            continue
          }
          candidateAssignedTabIds.add(tabId)
          candidateTabIds.push(tabId)
        }
      }
      candidateTabIds.forEach((tabId) => assignedTabIds.add(tabId))
      panels.push({
        id: candidate.id,
        tabIds: candidateTabIds,
        activeTabId:
          typeof candidate.activeTabId === "string" &&
          candidateTabIds.includes(candidate.activeTabId)
            ? candidate.activeTabId
            : (candidateTabIds[0] ?? null),
      })
    }
  }

  const legacyActiveTabId =
    typeof state.activeTabId === "string" && tabIds.has(state.activeTabId)
      ? state.activeTabId
      : null

  if (panels.length === 0) {
    const allTabIds = tabs.map((tab) => tab.id)
    panels.push({
      id: nanoid(),
      tabIds: allTabIds,
      activeTabId: legacyActiveTabId ?? allTabIds[0] ?? null,
    })
  } else {
    const orphanedTabIds = tabs
      .map((tab) => tab.id)
      .filter((tabId) => !assignedTabIds.has(tabId))
    if (orphanedTabIds.length > 0) {
      panels[0] = {
        ...panels[0],
        tabIds: [...panels[0].tabIds, ...orphanedTabIds],
        activeTabId: panels[0].activeTabId ?? orphanedTabIds[0],
      }
    }

    const nonEmptyPanels = panels.filter((panel) => panel.tabIds.length > 0)
    panels = nonEmptyPanels.length > 0 ? nonEmptyPanels : [panels[0]]
  }

  const activePanelId =
    typeof state.activePanelId === "string" &&
    panels.some((panel) => panel.id === state.activePanelId)
      ? state.activePanelId
      : (panels.find((panel) =>
          legacyActiveTabId ? panel.tabIds.includes(legacyActiveTabId) : false
        )?.id ?? panels[0].id)

  return {
    tabs,
    panels,
    activePanelId,
    history: persistedHistory(state.history, tabIds),
    closedTabsStack: persistedClosedTabs(state.closedTabsStack),
    splitDirection:
      state.splitDirection === "vertical" ? "vertical" : "horizontal",
  }
}
