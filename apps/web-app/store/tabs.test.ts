// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest"

import {
  normalizePersistedTabState,
  TAB_STORAGE_VERSION,
  useTabStore,
} from "./tabs"

const firstTab = {
  id: "tab-1",
  url: "/space-file#tasks.base",
  title: "tasks.base",
  lastAccessTime: 1,
}

const secondTab = {
  id: "tab-2",
  url: "/settings",
  title: "Settings",
  lastAccessTime: 2,
}

const thirdTab = {
  id: "tab-3",
  url: "/space-file#notes.md",
  title: "notes.md",
  lastAccessTime: 3,
}

const extensionPanelTab = {
  id: "extension-panel-tab",
  url: "/extension-panel?session=runtime-session-1",
  title: "Task summary",
  lastAccessTime: 4,
}

const firstHistory = {
  entries: [{ key: "history-1", url: firstTab.url }],
  index: 0,
}

const secondHistory = {
  entries: [{ key: "history-2", url: secondTab.url }],
  index: 0,
}

const thirdHistory = {
  entries: [{ key: "history-3", url: thirdTab.url }],
  index: 0,
}

describe("tab persistence migration", () => {
  beforeEach(() => {
    useTabStore.setState(useTabStore.getInitialState(), true)
    localStorage.clear()
  })

  it("declares an explicit storage version and migration", () => {
    const options = useTabStore.persist.getOptions()

    expect(options.version).toBe(TAB_STORAGE_VERSION)
    expect(options.migrate).toBeTypeOf("function")
    expect(options.merge).toBeTypeOf("function")
  })

  it("migrates the legacy single-panel payload without losing tabs", () => {
    const migrated = normalizePersistedTabState({
      tabs: [firstTab, secondTab],
      activeTabId: secondTab.id,
      history: {},
      closedTabsStack: [],
    })

    expect(migrated.tabs).toEqual([firstTab, secondTab])
    expect(migrated.panels).toHaveLength(1)
    expect(migrated.panels[0].tabIds).toEqual([firstTab.id, secondTab.id])
    expect(migrated.panels[0].activeTabId).toBe(secondTab.id)
    expect(migrated.activePanelId).toBe(migrated.panels[0].id)
  })

  it("repairs duplicate, missing, and orphaned panel references", () => {
    const migrated = normalizePersistedTabState({
      tabs: [firstTab, secondTab],
      panels: [
        {
          id: "panel-1",
          tabIds: [firstTab.id, firstTab.id, "missing-tab"],
          activeTabId: "missing-tab",
        },
        {
          id: "panel-2",
          tabIds: [firstTab.id],
          activeTabId: firstTab.id,
        },
      ],
      activePanelId: "missing-panel",
      splitDirection: "vertical",
      history: {
        [firstTab.id]: {
          entries: [{ key: "history-1", url: firstTab.url }],
          index: 0,
        },
        "closed-tab": {
          entries: [{ key: "history-2", url: "/closed" }],
          index: 0,
        },
      },
    })

    expect(migrated.panels).toEqual([
      {
        id: "panel-1",
        tabIds: [firstTab.id, secondTab.id],
        activeTabId: firstTab.id,
      },
    ])
    expect(migrated.activePanelId).toBe("panel-1")
    expect(migrated.history).toEqual({
      [firstTab.id]: {
        entries: [{ key: "history-1", url: firstTab.url }],
        index: 0,
      },
    })
    expect(migrated.splitDirection).toBe("vertical")
  })

  it("preserves a valid split-panel payload", () => {
    const history = {
      [firstTab.id]: {
        entries: [{ key: "history-1", url: firstTab.url }],
        index: 0,
      },
    }
    const closedTabsStack = [
      {
        url: "/space-file#archived.md",
        title: "archived.md",
      },
    ]
    const migrated = normalizePersistedTabState({
      tabs: [firstTab, secondTab],
      panels: [
        {
          id: "panel-1",
          tabIds: [firstTab.id],
          activeTabId: firstTab.id,
        },
        {
          id: "panel-2",
          tabIds: [secondTab.id],
          activeTabId: secondTab.id,
        },
      ],
      activePanelId: "panel-2",
      history,
      closedTabsStack,
      splitDirection: "vertical",
    })

    expect(migrated).toEqual({
      tabs: [firstTab, secondTab],
      panels: [
        {
          id: "panel-1",
          tabIds: [firstTab.id],
          activeTabId: firstTab.id,
        },
        {
          id: "panel-2",
          tabIds: [secondTab.id],
          activeTabId: secondTab.id,
        },
      ],
      activePanelId: "panel-2",
      history,
      closedTabsStack,
      splitDirection: "vertical",
    })
  })

  it("drops transient extension panel sessions from restored tabs and history", () => {
    const migrated = normalizePersistedTabState({
      tabs: [firstTab, extensionPanelTab, secondTab],
      panels: [
        {
          id: "panel-1",
          tabIds: [firstTab.id, extensionPanelTab.id],
          activeTabId: extensionPanelTab.id,
        },
        {
          id: "panel-2",
          tabIds: [secondTab.id],
          activeTabId: secondTab.id,
        },
      ],
      activePanelId: "panel-1",
      history: {
        [extensionPanelTab.id]: {
          entries: [{ key: "panel", url: extensionPanelTab.url }],
          index: 0,
        },
      },
      closedTabsStack: [
        { url: extensionPanelTab.url, title: extensionPanelTab.title },
      ],
    })

    expect(migrated.tabs).toEqual([firstTab, secondTab])
    expect(migrated.panels[0]).toEqual({
      id: "panel-1",
      tabIds: [firstTab.id],
      activeTabId: firstTab.id,
    })
    expect(migrated.history).toEqual({})
    expect(migrated.closedTabsStack).toEqual([])
  })
})

describe("tab lifecycle persistence", () => {
  beforeEach(() => {
    useTabStore.setState(useTabStore.getInitialState(), true)
    localStorage.clear()
    useTabStore.setState({
      tabs: [firstTab, secondTab, thirdTab],
      panels: [
        {
          id: "panel-1",
          tabIds: [firstTab.id, secondTab.id],
          activeTabId: firstTab.id,
        },
        {
          id: "panel-2",
          tabIds: [thirdTab.id],
          activeTabId: thirdTab.id,
        },
      ],
      activePanelId: "panel-1",
      history: {
        [firstTab.id]: firstHistory,
        [secondTab.id]: secondHistory,
        [thirdTab.id]: thirdHistory,
      },
      tabNavigators: {
        [firstTab.id]: () => undefined,
        [secondTab.id]: () => undefined,
        [thirdTab.id]: () => undefined,
      },
      nextNavigationOptions: {
        [firstTab.id]: { replace: true },
        [secondTab.id]: { replace: true },
        [thirdTab.id]: { replace: true },
      },
      closedTabsStack: [],
    })
  })

  it("closes other tabs only in the selected split panel", () => {
    useTabStore.getState().closeOtherTabs(firstTab.id)

    const state = useTabStore.getState()
    expect(state.tabs).toEqual([firstTab, thirdTab])
    expect(state.panels).toEqual([
      {
        id: "panel-1",
        tabIds: [firstTab.id],
        activeTabId: firstTab.id,
      },
      {
        id: "panel-2",
        tabIds: [thirdTab.id],
        activeTabId: thirdTab.id,
      },
    ])
    expect(state.history).toEqual({
      [firstTab.id]: firstHistory,
      [thirdTab.id]: thirdHistory,
    })
    expect(state.closedTabsStack).toEqual([
      {
        url: secondTab.url,
        title: secondTab.title,
        historyState: secondHistory,
      },
    ])
  })

  it("restores a closed tab with its navigation history", () => {
    useTabStore.getState().closeTab(secondTab.id)
    useTabStore.getState().reopenLastClosedTab()

    const state = useTabStore.getState()
    const reopenedTab = state.tabs.find((tab) => tab.url === secondTab.url)
    expect(reopenedTab).toBeDefined()
    expect(state.history[reopenedTab!.id]).toEqual(secondHistory)
    expect(state.closedTabsStack).toEqual([])
  })

  it("does not offer a closed runtime panel session for reopening", () => {
    useTabStore.setState((state) => ({
      tabs: [...state.tabs, extensionPanelTab],
      panels: state.panels.map((panel) =>
        panel.id === "panel-1"
          ? {
              ...panel,
              tabIds: [...panel.tabIds, extensionPanelTab.id],
              activeTabId: extensionPanelTab.id,
            }
          : panel
      ),
    }))

    useTabStore.getState().closeTab(extensionPanelTab.id)

    expect(useTabStore.getState().closedTabsStack).toEqual([])
  })

  it("closes tabs to the right without changing another split panel", () => {
    useTabStore.getState().closeTabsToRight(firstTab.id)

    const state = useTabStore.getState()
    expect(state.tabs).toEqual([firstTab, thirdTab])
    expect(state.panels[1]).toEqual({
      id: "panel-2",
      tabIds: [thirdTab.id],
      activeTabId: thirdTab.id,
    })
    expect(state.history).not.toHaveProperty(secondTab.id)
    expect(state.closedTabsStack.at(-1)).toEqual({
      url: secondTab.url,
      title: secondTab.title,
      historyState: secondHistory,
    })
  })

  it("keeps all closed tabs reopenable while clearing tab-owned state", () => {
    useTabStore.getState().closeAllTabs()

    const state = useTabStore.getState()
    expect(state.tabs).toEqual([])
    expect(state.panels).toEqual([])
    expect(state.history).toEqual({})
    expect(state.tabNavigators).toEqual({})
    expect(state.nextNavigationOptions).toEqual({})
    expect(state.closedTabsStack.map((tab) => tab.url)).toEqual([
      firstTab.url,
      secondTab.url,
      thirdTab.url,
    ])
  })

  it("removes panel-owned runtime state when a split panel closes", () => {
    useTabStore.getState().closePanel("panel-2")

    const state = useTabStore.getState()
    expect(state.tabs).toEqual([firstTab, secondTab])
    expect(state.history).toEqual({
      [firstTab.id]: firstHistory,
      [secondTab.id]: secondHistory,
    })
    expect(state.tabNavigators).not.toHaveProperty(thirdTab.id)
    expect(state.nextNavigationOptions).not.toHaveProperty(thirdTab.id)
    expect(state.closedTabsStack.at(-1)).toEqual({
      url: thirdTab.url,
      title: thirdTab.title,
      historyState: thirdHistory,
    })
  })
})
