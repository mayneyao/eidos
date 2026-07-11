import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import { DocumentNavigationPanel } from "./document-navigation-panel"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const getDocumentMetadataMock = vi.hoisted(() => vi.fn())
const getBacklinksMock = vi.hoisted(() => vi.fn())
const navigateMock = vi.hoisted(() => vi.fn())
const navigateAfterFlushMock = vi.hoisted(() => vi.fn())

vi.mock("@/apps/web-app/hooks/use-space-files", () => ({
  useSpaceFiles: () => ({
    getDocumentMetadata: getDocumentMetadataMock,
    getBacklinks: getBacklinksMock,
  }),
  useSpaceFileChanges: () => undefined,
}))

vi.mock("@/apps/web-app/hooks/use-router-adapter", () => ({
  useRouterAdapter: () => ({
    location: {
      pathname: "/space-file",
      search: "",
      hash: "#notes%2Fproject.md",
    },
    navigate: navigateMock,
  }),
}))

vi.mock("./file-navigation", () => ({
  navigateAfterFlushingSpaceFile: navigateAfterFlushMock,
}))

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

describe("DocumentNavigationPanel", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    getDocumentMetadataMock.mockReset()
    getDocumentMetadataMock.mockResolvedValue({
      path: "notes/project.md",
      title: "Project",
      aliases: [],
      tags: [],
      frontmatter: { aliases: [], tags: [] },
      headings: [
        { depth: 1, text: "Project", line: 1, slug: "project" },
        { depth: 2, text: "Next step", line: 4, slug: "next-step" },
      ],
    })
    getBacklinksMock.mockReset()
    getBacklinksMock.mockResolvedValue([
      {
        sourcePath: "notes/index.md",
        sourceName: "index.md",
        count: 2,
        references: [
          { target: "project", line: 3, snippet: "See [[Project]]" },
        ],
      },
    ])
    navigateMock.mockReset()
    navigateAfterFlushMock.mockReset()
    navigateAfterFlushMock.mockResolvedValue(true)
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("navigates the current note outline without adding document chrome", async () => {
    act(() => root.render(<DocumentNavigationPanel spaceId="space-a" />))
    await settle()

    expect(getDocumentMetadataMock).toHaveBeenCalledWith("notes/project.md")
    expect(container.textContent).toContain("Next step")
    const heading = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Next step")
    )
    act(() => heading?.click())

    expect(navigateMock).toHaveBeenCalledWith(
      "/space-file?heading=next-step#notes%2Fproject.md",
      { replace: true }
    )
  })

  it("opens backlinks after flushing the current note", async () => {
    act(() => root.render(<DocumentNavigationPanel spaceId="space-a" />))
    await settle()

    const backlinksHeader = Array.from(
      container.querySelectorAll("button")
    ).find((button) => button.textContent?.includes("Backlinks"))
    act(() => backlinksHeader?.click())
    const backlink = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("index.md")
    )
    act(() => backlink?.click())
    await settle()

    expect(navigateAfterFlushMock).toHaveBeenCalledWith({
      spaceId: "space-a",
      currentFilePath: "notes/project.md",
      destination: "/space-file#notes%2Findex.md",
      navigate: navigateMock,
      options: { target: "_blank" },
    })
  })
})
