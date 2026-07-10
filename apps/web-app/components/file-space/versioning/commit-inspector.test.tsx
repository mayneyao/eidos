import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import type {
  SpaceVersionCommit,
  SpaceVersionDiff,
  SpaceVersionStatus,
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

const status: SpaceVersionStatus = {
  enabled: true,
  clean: true,
  hasConflicts: false,
  branch: "main",
  head: {
    id: "commit-3",
    message: "Current version",
    timestamp: 1_720_000_100_000,
    parents: ["commit-2"],
    labels: [],
    changedPaths: [],
  },
  changes: [],
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
    const restorePath = vi.fn()

    await act(async () => {
      root.render(
        <CommitInspector
          commit={commit}
          getCommit={getCommit}
          getDiff={getDiff}
          status={status}
          operation={null}
          restorePath={restorePath}
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

  it("restores the selected path after an explicit non-committing confirmation", async () => {
    const getCommit = vi.fn(async () => commit)
    const getDiff = vi.fn(async () => diff)
    const restorePath = vi.fn(async () => ({
      revision: "commit-2",
      path: "notes/a.md",
      kind: "text_file" as const,
      storage: "inline" as const,
      effect: "modified" as const,
      status,
    }))

    await act(async () => {
      root.render(
        <CommitInspector
          commit={commit}
          getCommit={getCommit}
          getDiff={getDiff}
          status={status}
          operation={null}
          restorePath={restorePath}
        />
      )
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const restoreButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="Restore notes/a.md from this version"]'
    )
    await act(async () => {
      restoreButton?.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(document.body.textContent).toContain("HEAD will not move")
    expect(document.body.textContent).toContain("no version will be created")

    const confirmButton = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Restore file")
    )
    await act(async () => {
      confirmButton?.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(restorePath).toHaveBeenCalledWith({
      revision: "commit-2",
      path: "notes/a.md",
      expectedHead: "commit-3",
      overwriteChanges: true,
      allowDelete: false,
    })
    expect(container.textContent).toContain(
      "Review it in Changes before creating a version"
    )
  })

  it("uses a destructive confirmation when restoring a deleted state", async () => {
    const deletedCommit: SpaceVersionCommit = {
      ...commit,
      id: "delete-2",
      message: "Remove old note",
      changedPaths: [{ path: "notes/gone.md", status: "deleted" }],
    }
    const getCommit = vi.fn(async () => deletedCommit)
    const getDiff = vi.fn(async () => ({
      ...diff,
      to: "delete-2",
      paths: [
        {
          path: "notes/gone.md",
          change: "deleted" as const,
          kind: "text_file" as const,
          storage: "inline" as const,
        },
      ],
    }))
    const restorePath = vi.fn(async () => ({
      revision: "delete-2",
      path: "notes/gone.md",
      kind: "text_file" as const,
      storage: "inline" as const,
      effect: "deleted" as const,
      status,
    }))

    await act(async () => {
      root.render(
        <CommitInspector
          commit={deletedCommit}
          getCommit={getCommit}
          getDiff={getDiff}
          status={status}
          operation={null}
          restorePath={restorePath}
        />
      )
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[aria-label="Restore notes/gone.md from this version"]'
        )
        ?.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(document.body.textContent).toContain("will delete the working file")

    const deleteButton = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Delete working file")
    )
    await act(async () => {
      deleteButton?.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(restorePath).toHaveBeenCalledWith(
      expect.objectContaining({
        revision: "delete-2",
        path: "notes/gone.md",
        allowDelete: true,
      })
    )
  })
})
