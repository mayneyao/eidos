import type { Panel, Tab } from "@/apps/web-app/store/tabs"

import { isSettingsUrl, resolveBackToAppTarget } from "./settings-navigation"

function tab(id: string, url: string, lastAccessTime: number): Tab {
  return { id, url, title: id, lastAccessTime }
}

function panel(id: string, tabIds: string[], activeTabId: string): Panel {
  return { id, tabIds, activeTabId }
}

describe("settings navigation", () => {
  it("recognizes only the Settings route namespace", () => {
    expect(isSettingsUrl("/settings")).toBe(true)
    expect(isSettingsUrl("/settings/space-general?source=space")).toBe(true)
    expect(isSettingsUrl("/settings-preview")).toBe(false)
    expect(isSettingsUrl("/space-file#settings")).toBe(false)
  })

  it("returns to the nearest non-Settings entry in the current tab", () => {
    expect(
      resolveBackToAppTarget({
        tabs: [tab("settings", "/settings/ai", 3)],
        panels: [panel("main", ["settings"], "settings")],
        activePanelId: "main",
        activeTabId: "settings",
        history: {
          settings: {
            entries: [
              { key: "file", url: "/space-file#notes%2Fplan.md" },
              { key: "settings", url: "/settings" },
              { key: "ai", url: "/settings/ai" },
            ],
            index: 2,
          },
        },
      })
    ).toEqual({ type: "history", tabId: "settings", delta: -2 })
  })

  it("prefers the most recent app tab in the active panel", () => {
    expect(
      resolveBackToAppTarget({
        tabs: [
          tab("other-panel", "/version/history", 20),
          tab("file", "/space-file#notes%2Fplan.md", 10),
          tab("settings", "/settings/general", 30),
        ],
        panels: [
          panel("main", ["file", "settings"], "settings"),
          panel("secondary", ["other-panel"], "other-panel"),
        ],
        activePanelId: "main",
        activeTabId: "settings",
        history: {},
      })
    ).toEqual({ type: "tab", tabId: "file" })
  })

  it("falls back to the Space home when no app destination exists", () => {
    expect(
      resolveBackToAppTarget({
        tabs: [tab("settings", "/settings", 1)],
        panels: [panel("main", ["settings"], "settings")],
        activePanelId: "main",
        activeTabId: "settings",
        history: {},
      })
    ).toEqual({ type: "home" })
  })
})
