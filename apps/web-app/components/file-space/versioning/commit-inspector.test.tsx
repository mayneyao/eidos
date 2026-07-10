import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import type {
  SpaceVersionCommit,
  SpaceVersionDiff,
} from "@/apps/web-app/hooks/use-space-versioning"

import { CommitInspector } from "./commit-inspector"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const commit: SpaceVersionCommit = {
  id: "commit-2",
  message: "Update notes",
  timestamp: 1_720_000_000_000,
  parents: ["commit-1"],
  labels: [],
  changedPaths: [
    { path: "notes/a.md", status: "modified" },
    { path: "notes/b.md", status: "added" },
  ],
}

const diff: SpaceVersionDiff = {
  currentHead: "commit-2",
  currentBranch: "main",
  from: "commit-1",
  to: "commit-2",
  paths: [
    {
      path: "notes/a.md",
      change: "modified",
      kind: "text_file",
      storage: "inline",
    },
    {
      path: "notes/b.md",
      change: "added",
      kind: "text_file",
      storage: "inline",
    },
  ],
}

describe("CommitInspector", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("loads one full diff and reuses it while selecting paths", async () => {
    const getCommit = vi.fn(async () => commit)
    const getDiff = vi.fn(async () => diff)

    await act(async () => {
      root.render(
        <CommitInspector
          commit={commit}
          getCommit={getCommit}
          getDiff={getDiff}
        />
      )
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(getCommit).toHaveBeenCalledOnce()
    expect(getDiff).toHaveBeenCalledOnce()
    expect(getDiff).toHaveBeenCalledWith({
      from: "commit-1",
      to: "commit-2",
    })

    const secondPath = [...container.querySelectorAll("button")].find(
      (button) => button.title === "notes/b.md"
    )
    await act(async () => secondPath?.click())

    expect(getDiff).toHaveBeenCalledOnce()
    expect(container.textContent).toContain("Added")
    expect(container.textContent).toContain("notes/b.md")
  })
})
