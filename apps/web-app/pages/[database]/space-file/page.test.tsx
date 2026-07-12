import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { MemoryRouter } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SpaceFilePage } from "./page"

const mocks = vi.hoisted(() => ({
  fileChangeHandler: null as
    | ((event: { eventType: string; path: string }) => void)
    | null,
  readText: vi.fn(),
  fetch: vi.fn(async () => ({ ok: true, status: 200 })),
  registerPendingWriteFlusher: vi.fn(
    (_id: string, _flusher: () => Promise<boolean>) => vi.fn()
  ),
  versioningOperation: null as string | null,
  writeText: vi.fn(),
}))

vi.mock("@monaco-editor/react", () => ({
  default: () => <div data-testid="monaco-editor" />,
}))

vi.mock("@/apps/web-app/components/file-space/base/space-base-editor", () => ({
  SpaceBaseEditor: ({ filePath }: { filePath: string }) => (
    <div data-testid="base-editor" data-path={filePath} />
  ),
}))

vi.mock("@/apps/web-app/components/file-space/space-markdown-editor", () => ({
  SpaceMarkdownEditor: ({
    onChange,
    onSave,
    readOnly,
    value,
  }: {
    onChange?: (value: string) => void
    onSave?: () => void
    readOnly?: boolean
    value: string
  }) => (
    <div
      data-testid="lexical-markdown-editor"
      data-readonly={String(Boolean(readOnly))}
      data-value={value}
    >
      <button data-testid="edit-first" onClick={() => onChange?.("first")} />
      <button data-testid="edit-latest" onClick={() => onChange?.("latest")} />
      <button data-testid="save" onClick={() => onSave?.()} />
    </div>
  ),
}))

vi.mock("@/apps/web-app/components/file-space/pending-writes", () => ({
  registerPendingWriteFlusher: mocks.registerPendingWriteFlusher,
}))

vi.mock("@/apps/web-app/hooks/use-current-space", () => ({
  useCurrentSpace: () => ({ currentSpace: { id: "space-a" } }),
}))

vi.mock("@/apps/web-app/hooks/use-space-files", () => ({
  useSpaceFileChanges: (
    _spaceId: string | undefined,
    handler: (event: { eventType: string; path: string }) => void
  ) => {
    mocks.fileChangeHandler = handler
  },
  useSpaceFiles: () => ({
    readText: mocks.readText,
    writeText: mocks.writeText,
  }),
}))

vi.mock("@/apps/web-app/hooks/use-space-versioning", () => ({
  isDestructiveSpaceVersioningOperation: (operation: string | null) =>
    operation === "discarding" || operation === "restoring",
  useActiveSpaceVersioningOperation: () => mocks.versioningOperation,
}))

vi.mock("@/apps/web-app/hooks/use-tab-dirty", () => ({
  useTabDirty: () => undefined,
}))

vi.mock("@/apps/web-app/hooks/use-tab-title", () => ({
  useTabTitle: () => undefined,
}))

vi.mock("@/components/theme-provider", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}))

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

async function flushEffects() {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe("SpaceFilePage editor selection", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    mocks.readText.mockReset()
    mocks.fetch.mockClear()
    vi.stubGlobal("fetch", mocks.fetch)
    mocks.writeText.mockReset()
    mocks.registerPendingWriteFlusher.mockClear()
    mocks.fileChangeHandler = null
    mocks.versioningOperation = null
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  })

  it("mounts the standalone Lexical editor, never Monaco, for Markdown", async () => {
    mocks.readText.mockResolvedValue({
      path: "notes/today.md",
      content: "# Today\n",
      size: 8,
      mtimeMs: 1,
    })

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/space-file#notes%2Ftoday.md"]}>
          <SpaceFilePage />
        </MemoryRouter>
      )
      await flushEffects()
    })

    const lexical = container.querySelector<HTMLElement>(
      '[data-testid="lexical-markdown-editor"]'
    )
    expect(lexical?.dataset.value).toBe("# Today\n")
    expect(container.querySelector('[data-testid="monaco-editor"]')).toBeNull()
    expect(container.textContent).not.toContain("notes/today.md")
    expect(container.textContent).not.toContain("Saved")
  })

  it("keeps Monaco for non-Markdown text files", async () => {
    mocks.readText.mockResolvedValue({
      path: "notes/data.json",
      content: '{"ok":true}\n',
      size: 12,
      mtimeMs: 1,
    })

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/space-file#notes%2Fdata.json"]}>
          <SpaceFilePage />
        </MemoryRouter>
      )
      await flushEffects()
    })

    expect(
      container.querySelector('[data-testid="monaco-editor"]')
    ).not.toBeNull()
    expect(
      container.querySelector('[data-testid="lexical-markdown-editor"]')
    ).toBeNull()
  })

  it("opens .base files in the standalone Base editor", async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/space-file#projects%2Ftasks.base"]}>
          <SpaceFilePage />
        </MemoryRouter>
      )
      await flushEffects()
    })

    expect(
      container.querySelector<HTMLElement>('[data-testid="base-editor"]')
        ?.dataset.path
    ).toBe("projects/tasks.base")
    expect(container.querySelector('[data-testid="monaco-editor"]')).toBeNull()
    expect(
      container.querySelector('[data-testid="lexical-markdown-editor"]')
    ).toBeNull()
  })

  it("refreshes a nested asset preview after a whole Space rescan", async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/space-file#assets%2Fcover.png"]}>
          <SpaceFilePage />
        </MemoryRouter>
      )
      await flushEffects()
    })
    expect(mocks.fetch).toHaveBeenCalledWith("/~/assets/cover.png", {
      method: "HEAD",
      cache: "no-store",
    })

    await act(async () => {
      mocks.fileChangeHandler?.({ eventType: "rescan", path: "" })
      await flushEffects()
    })

    expect(mocks.fetch).toHaveBeenLastCalledWith("/~/assets/cover.png?v=1", {
      method: "HEAD",
      cache: "no-store",
    })
  })

  it("makes the Markdown surface read-only during destructive restores", async () => {
    mocks.versioningOperation = "discarding"
    mocks.readText.mockResolvedValue({
      path: "notes/today.md",
      content: "# Today\n",
      size: 8,
      mtimeMs: 1,
    })

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/space-file#notes%2Ftoday.md"]}>
          <SpaceFilePage />
        </MemoryRouter>
      )
      await flushEffects()
    })

    expect(
      container.querySelector<HTMLElement>(
        '[data-testid="lexical-markdown-editor"]'
      )?.dataset.readonly
    ).toBe("true")
  })

  it("writes the latest edit immediately after an in-flight save", async () => {
    const firstWrite = deferred<{
      path: string
      content: string
      size: number
      mtimeMs: number
    }>()
    const latestWrite = deferred<{
      path: string
      content: string
      size: number
      mtimeMs: number
    }>()
    mocks.readText.mockResolvedValue({
      path: "notes/today.md",
      content: "initial",
      size: 7,
      mtimeMs: 1,
    })
    mocks.writeText
      .mockReturnValueOnce(firstWrite.promise)
      .mockReturnValueOnce(latestWrite.promise)

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/space-file#notes%2Ftoday.md"]}>
          <SpaceFilePage />
        </MemoryRouter>
      )
      await flushEffects()
    })

    act(() => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="edit-first"]')
        ?.click()
      container
        .querySelector<HTMLButtonElement>('[data-testid="save"]')
        ?.click()
    })
    expect(mocks.writeText).toHaveBeenNthCalledWith(
      1,
      "notes/today.md",
      "first",
      1
    )

    act(() => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="edit-latest"]')
        ?.click()
      container
        .querySelector<HTMLButtonElement>('[data-testid="save"]')
        ?.click()
    })
    expect(mocks.writeText).toHaveBeenCalledTimes(1)

    await act(async () => {
      firstWrite.resolve({
        path: "notes/today.md",
        content: "first",
        size: 5,
        mtimeMs: 2,
      })
      await firstWrite.promise
      await flushEffects()
    })
    expect(mocks.writeText).toHaveBeenNthCalledWith(
      2,
      "notes/today.md",
      "latest",
      2
    )

    await act(async () => {
      latestWrite.resolve({
        path: "notes/today.md",
        content: "latest",
        size: 6,
        mtimeMs: 3,
      })
      await latestWrite.promise
      await flushEffects()
    })
  })

  it("flushes the current Markdown edit before navigation or versioning", async () => {
    mocks.readText.mockResolvedValue({
      path: "notes/today.md",
      content: "initial",
      size: 7,
      mtimeMs: 1,
    })
    mocks.writeText.mockResolvedValue({
      path: "notes/today.md",
      content: "latest",
      size: 6,
      mtimeMs: 2,
    })

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/space-file#notes%2Ftoday.md"]}>
          <SpaceFilePage />
        </MemoryRouter>
      )
      await flushEffects()
    })
    act(() => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="edit-latest"]')
        ?.click()
    })

    const flusher = mocks.registerPendingWriteFlusher.mock.calls[0]?.[1] as
      | (() => Promise<boolean>)
      | undefined
    await act(async () => {
      await expect(flusher?.()).resolves.toBe(true)
      await flushEffects()
    })

    expect(mocks.writeText).toHaveBeenCalledWith("notes/today.md", "latest", 1)
  })

  it("reloads a clean Markdown editor after an external file change", async () => {
    mocks.readText.mockResolvedValue({
      path: "notes/today.md",
      content: "initial",
      size: 7,
      mtimeMs: 1,
    })

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/space-file#notes%2Ftoday.md"]}>
          <SpaceFilePage />
        </MemoryRouter>
      )
      await flushEffects()
    })
    mocks.readText.mockResolvedValueOnce({
      path: "notes/today.md",
      content: "outside",
      size: 7,
      mtimeMs: 2,
    })
    await act(async () => {
      mocks.fileChangeHandler?.({
        eventType: "change",
        path: "notes/today.md",
      })
      await flushEffects()
    })

    expect(
      container.querySelector<HTMLElement>(
        '[data-testid="lexical-markdown-editor"]'
      )?.dataset.value
    ).toBe("outside")
    expect(container.textContent).not.toContain("changed outside Eidos")
  })

  it("preserves dirty Markdown and reports an external edit conflict", async () => {
    mocks.readText.mockResolvedValue({
      path: "notes/today.md",
      content: "initial",
      size: 7,
      mtimeMs: 1,
    })

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/space-file#notes%2Ftoday.md"]}>
          <SpaceFilePage />
        </MemoryRouter>
      )
      await flushEffects()
    })
    act(() => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="edit-latest"]')
        ?.click()
    })
    mocks.readText.mockResolvedValueOnce({
      path: "notes/today.md",
      content: "outside",
      size: 7,
      mtimeMs: 2,
    })
    await act(async () => {
      mocks.fileChangeHandler?.({
        eventType: "change",
        path: "notes/today.md",
      })
      await flushEffects()
    })

    expect(
      container.querySelector<HTMLElement>(
        '[data-testid="lexical-markdown-editor"]'
      )?.dataset.value
    ).toBe("latest")
    expect(container.textContent).toContain(
      "This file changed outside Eidos while you were editing."
    )
    expect(mocks.writeText).not.toHaveBeenCalled()
  })
})
