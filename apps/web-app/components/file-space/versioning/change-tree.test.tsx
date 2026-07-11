// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { VersionChangeTree } from "./change-tree"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

describe("VersionChangeTree", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("opens diffs and exposes keyboard-focusable row actions", async () => {
    const openDiff = vi.fn()
    const reveal = vi.fn()
    const stage = vi.fn()
    const unstage = vi.fn()
    const discard = vi.fn()

    await act(async () => {
      root.render(
        <VersionChangeTree
          changes={[
            { path: "notes/draft.md", status: "modified", unstaged: true },
            { path: "notes/included.md", status: "modified", staged: true },
            { path: "notes/deleted.md", status: "deleted", unstaged: true },
          ]}
          onOpenDiff={openDiff}
          onRevealPath={reveal}
          onStagePath={stage}
          onUnstagePath={unstage}
          onDiscardPath={discard}
        />
      )
    })

    const draft = container.querySelector<HTMLButtonElement>(
      'button[title="notes/draft.md"]'
    )
    draft?.click()
    expect(openDiff).toHaveBeenCalledWith("notes/draft.md")

    const openDraft = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Open notes/draft.md"]'
    )
    openDraft?.focus()
    expect(document.activeElement).toBe(openDraft)
    openDraft?.click()
    expect(reveal).toHaveBeenCalledWith("notes/draft.md")

    container
      .querySelector<HTMLButtonElement>(
        'button[aria-label="Include notes/draft.md in the next version"]'
      )
      ?.click()
    expect(stage).toHaveBeenCalledWith("notes/draft.md")

    container
      .querySelector<HTMLButtonElement>(
        'button[aria-label="Exclude notes/included.md from the next version"]'
      )
      ?.click()
    expect(unstage).toHaveBeenCalledWith("notes/included.md")

    container
      .querySelector<HTMLButtonElement>(
        'button[aria-label="Discard changes to notes/draft.md"]'
      )
      ?.click()
    expect(discard).toHaveBeenCalledWith("notes/draft.md")
  })

  it("does not offer an invalid open action for deleted files", async () => {
    await act(async () => {
      root.render(
        <VersionChangeTree
          changes={[{ path: "deleted.md", status: "deleted", unstaged: true }]}
        />
      )
    })

    const openDeleted = container.querySelector<HTMLButtonElement>(
      'button[aria-label="deleted.md cannot be opened because it was deleted"]'
    )
    expect(openDeleted?.disabled).toBe(true)
    expect(openDeleted?.title).toBe("Deleted files cannot be opened")
  })

  it("stages and unstages a whole directory from its section", async () => {
    const stage = vi.fn()
    const unstage = vi.fn()

    await act(async () => {
      root.render(
        <VersionChangeTree
          mode="unstaged"
          changes={[
            { path: "notes/one.md", status: "modified", unstaged: true },
            {
              path: "notes/nested/two.md",
              status: "modified",
              unstaged: true,
            },
          ]}
          onStagePath={stage}
        />
      )
    })

    container
      .querySelector<HTMLButtonElement>(
        'button[aria-label="Include directory notes in the next version"]'
      )
      ?.click()
    expect(stage).toHaveBeenCalledWith("notes")

    await act(async () => {
      root.render(
        <VersionChangeTree
          mode="staged"
          changes={[
            { path: "notes/one.md", status: "modified", staged: true },
            {
              path: "notes/nested/two.md",
              status: "modified",
              staged: true,
            },
          ]}
          onUnstagePath={unstage}
        />
      )
    })

    container
      .querySelector<HTMLButtonElement>(
        'button[aria-label="Exclude directory notes from the next version"]'
      )
      ?.click()
    expect(unstage).toHaveBeenCalledWith("notes")
  })
})
