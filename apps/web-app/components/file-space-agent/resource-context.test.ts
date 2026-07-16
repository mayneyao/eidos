// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest"

import { useTabStore } from "@/apps/web-app/store/tabs"

import { openFileSpaceAgent } from "./open-agent"
import {
  clearMarkdownSelection,
  rememberMarkdownSelection,
  resourceContextFromTabUrl,
} from "./resource-context"

beforeEach(() => {
  useTabStore.setState(useTabStore.getInitialState(), true)
  clearMarkdownSelection("Notes/Today.md")
})

describe("file Space Agent resource context", () => {
  it("captures file, heading, and current Markdown selection", () => {
    rememberMarkdownSelection("Notes/Today.md", " selected context ")
    expect(
      resourceContextFromTabUrl(
        "/space-file?heading=Decisions#Notes%2FToday.md"
      )
    ).toEqual({
      sourceUrl: "/space-file?heading=Decisions#Notes%2FToday.md",
      path: "Notes/Today.md",
      heading: "Decisions",
      tableId: undefined,
      rowId: undefined,
      selection: "selected context",
    })
  })

  it("captures a Base record target without inventing a text selection", () => {
    expect(
      resourceContextFromTabUrl(
        "/space-file?table=tasks&record=row-1#Projects.base"
      )
    ).toEqual({
      sourceUrl: "/space-file?table=tasks&record=row-1#Projects.base",
      path: "Projects.base",
      heading: undefined,
      tableId: "tasks",
      rowId: "row-1",
      selection: undefined,
    })
  })

  it("opens Agent in a new right panel with the source context", async () => {
    useTabStore
      .getState()
      .openTab("/space-file?heading=Decisions#Notes%2FToday.md", "Today")
    rememberMarkdownSelection("Notes/Today.md", "selected context")

    const conversationId = await openFileSpaceAgent({
      openInRightPanel: true,
      spaceId: "space-1",
    })

    expect(conversationId).toBeTruthy()
    const state = useTabStore.getState()
    const agent = state.tabs.find(
      (tab) => tab.url === `/agent/${conversationId}`
    )
    expect(agent?.initialState).toMatchObject({
      sourceUrl: "/space-file?heading=Decisions#Notes%2FToday.md",
      selection: "selected context",
    })
    expect(state.panels).toHaveLength(2)
  })
})
