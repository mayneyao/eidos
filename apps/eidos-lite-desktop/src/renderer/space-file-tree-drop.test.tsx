// @vitest-environment jsdom
import { act, type HTMLAttributes } from "react"
import { createRoot } from "react-dom/client"
import {
  FileTree as PierreFileTree,
  type FileTreeRowDecorationContext,
  type FileTreeOptions,
} from "@pierre/trees"
import { SpaceFileTree } from "./space-file-tree"
import { EIDOS_LITE_SPACE_PATH_DRAG_TYPE } from "./space-path-drag"

let treeModel: PierreFileTree
let treeOptions: FileTreeOptions

vi.mock("@pierre/trees/react", async () => {
  const { useMemo } = await import("react")
  const { FileTree } = await import("@pierre/trees")
  return {
    FileTree: ({
      model: _model,
      ...props
    }: HTMLAttributes<HTMLDivElement> & { model: unknown }) => (
      <div {...props}>
        <span data-item-path="docs/">Folder</span>
        <span data-item-path="docs/note.md">File</span>
        <span>Blank area</span>
      </div>
    ),
    useFileTree: (options: FileTreeOptions) => ({
      model: useMemo(() => {
        treeOptions = options
        treeModel = new FileTree(options)
        return treeModel
      }, []),
    }),
    useFileTreeSelection: () => [],
  }
})
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

it("moves into the blank root area optimistically and restores a failed move", async () => {
  const host = document.createElement("div")
  const root = createRoot(host)
  let rejectMove!: (cause: Error) => void
  const onMove = vi.fn(
    () =>
      new Promise<void>((_, reject) => {
        rejectMove = reject
      })
  )
  const onMoveError = vi.fn()
  const props = {
    entries: [
      {
        name: "docs",
        relativePath: "docs",
        kind: "directory" as const,
        size: 0,
        modifiedAtMs: 1,
        childrenLoaded: true,
        children: [
          {
            name: "note.md",
            relativePath: "docs/note.md",
            kind: "file" as const,
            size: 1,
            modifiedAtMs: 1,
          },
        ],
      },
    ],
    activePath: null,
    renameRequest: null,
    onMove,
    onMoveError,
    onSelect: vi.fn(),
    onOpen: vi.fn(),
    onLoadDirectory: vi.fn(),
    onRename: vi.fn(),
    onRenameError: vi.fn(),
    onContextMenu: vi.fn(),
  }
  try {
    await act(async () => root.render(<SpaceFileTree {...props} />))
    const target = {
      kind: "root" as const,
      directoryPath: null,
      hoveredPath: null,
      flattenedSegmentPath: null,
    }
    const draggedPaths = ["docs/note.md"]
    const dnd = treeOptions.dragAndDrop!
    if (typeof dnd === "boolean") throw new Error("Missing drag configuration")
    const renaming = treeOptions.renaming!
    if (typeof renaming === "boolean")
      throw new Error("Missing rename configuration")
    expect(dnd.canDrag?.(["Space/"])).toBe(false)
    expect(renaming.canRename?.({ path: "Space", isFolder: true })).toBe(false)
    expect(dnd.canDrop?.({ draggedPaths, target })).toBe(true)
    expect(dnd.canDrop?.({ draggedPaths: ["docs/"], target })).toBe(false)
    expect(treeModel.getItem("Space/")).toBeNull()
    const reset = vi.spyOn(treeModel, "resetPaths")
    const treeElement = host.querySelector("[data-space-file-tree]")!
    const transfer = {
      types: [EIDOS_LITE_SPACE_PATH_DRAG_TYPE],
      setData: vi.fn(),
      dropEffect: "none",
    }
    const dispatchDrag = async (type: string, target: Element) => {
      const event = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperty(event, "dataTransfer", { value: transfer })
      await act(async () => {
        target.dispatchEvent(event)
      })
      return event
    }
    await dispatchDrag("dragstart", treeElement.children[1]!)
    await dispatchDrag("dragover", treeElement)
    expect(transfer.dropEffect).toBe("move")
    expect(host.querySelector(".space-external-drop-hint")?.textContent).toBe(
      "Move to Space root"
    )
    expect((await dispatchDrag("drop", treeElement)).defaultPrevented).toBe(
      true
    )
    expect(treeModel.getItem("note.md")).not.toBeNull()
    expect(onMove).toHaveBeenCalledWith(["docs/note.md"], null)
    expect(reset).not.toHaveBeenCalled()
    await act(async () => rejectMove(new Error("Destination exists")))
    expect(treeModel.getItem("docs/note.md")).not.toBeNull()
    expect(treeModel.getItem("note.md")).toBeNull()
    expect(treeModel.getSelectedPaths()).toContain("docs/note.md")
    expect(onMoveError).toHaveBeenCalledOnce()
  } finally {
    await act(async () => root.unmount())
  }
})

it("imports external files into the root, folder, or file parent without intercepting internal moves", async () => {
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const onImportFiles = vi.fn().mockResolvedValue(undefined)
  const callbacks = {
    onSelect: vi.fn(),
    onOpen: vi.fn(),
    onLoadDirectory: vi.fn(),
    onMove: vi.fn(),
    onMoveError: vi.fn(),
    onRename: vi.fn(),
    onRenameError: vi.fn(),
    onContextMenu: vi.fn(),
  }
  const file = new File(["hello"], "hello.txt")
  const render = async (disabled = false) => {
    await act(async () =>
      root.render(
        <SpaceFileTree
          {...callbacks}
          entries={[]}
          activePath={null}
          renameRequest={null}
          disabled={disabled}
          onImportFiles={onImportFiles}
        />
      )
    )
  }
  const drop = async (target: Element, types = ["Files"]) => {
    const event = new Event("drop", { bubbles: true, cancelable: true })
    Object.defineProperty(event, "dataTransfer", {
      value: { types, files: [file] },
    })
    await act(async () => {
      target.dispatchEvent(event)
    })
    return event
  }
  const dragOver = async (target: Element) => {
    const event = new Event("dragover", { bubbles: true, cancelable: true })
    Object.defineProperty(event, "dataTransfer", {
      value: { types: ["Files"], dropEffect: "none" },
    })
    await act(async () => target.dispatchEvent(event))
  }
  try {
    await render()
    const shell = host.firstElementChild!
    const tree = shell.firstElementChild!
    await dragOver(tree.children[0]!)
    expect(shell.querySelector(".space-external-drop-hint")?.textContent).toBe(
      "Import into docs"
    )
    expect(tree.children[0]?.hasAttribute("data-external-drop-target")).toBe(
      true
    )
    await dragOver(tree.children[1]!)
    expect(shell.querySelector(".space-external-drop-hint")?.textContent).toBe(
      "Import into docs"
    )
    expect(tree.children[0]?.hasAttribute("data-external-drop-target")).toBe(
      true
    )
    expect(tree.children[1]?.hasAttribute("data-external-drop-target")).toBe(
      false
    )
    await dragOver(tree)
    expect(shell.querySelector(".space-external-drop-hint")?.textContent).toBe(
      "Import into Space root"
    )
    expect(tree.children[0]?.hasAttribute("data-external-drop-target")).toBe(
      false
    )
    for (const [target, directory] of [
      [tree, null],
      [tree.children[0]!, "docs"],
      [tree.children[1]!, "docs"],
      [tree.children[2]!, null],
    ] as const) {
      expect((await drop(target)).defaultPrevented).toBe(true)
      expect(onImportFiles).toHaveBeenLastCalledWith([file], directory)
    }
    expect(onImportFiles).toHaveBeenCalledTimes(4)
    expect(
      (await drop(tree.children[0]!, [EIDOS_LITE_SPACE_PATH_DRAG_TYPE]))
        .defaultPrevented
    ).toBe(false)
    await render(true)
    await drop(tree)
    expect(onImportFiles).toHaveBeenCalledTimes(4)
  } finally {
    act(() => root.unmount())
    host.remove()
  }
})

it("shows folder loading and a retry state after a failed lazy load", async () => {
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const decoration = vi.spyOn(PierreFileTree.prototype, "setRowDecoration")
  let rejectFirst!: (error: Error) => void
  let resolveRetry!: () => void
  const onLoadDirectory = vi
    .fn()
    .mockReturnValueOnce(
      new Promise<void>((_, reject) => {
        rejectFirst = reject
      })
    )
    .mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveRetry = resolve
      })
    )
  const context = {
    item: { kind: "directory", name: "docs", path: "docs/" },
    row: {},
  } as FileTreeRowDecorationContext
  const currentDecoration = () => decoration.mock.lastCall?.[0]?.(context)
  try {
    await act(async () =>
      root.render(
        <SpaceFileTree
          entries={[
            {
              name: "docs",
              relativePath: "docs",
              kind: "directory",
              size: 0,
              modifiedAtMs: 1,
              childrenLoaded: false,
            },
          ]}
          activePath={null}
          renameRequest={null}
          onSelect={vi.fn()}
          onOpen={vi.fn()}
          onLoadDirectory={onLoadDirectory}
          onMove={vi.fn()}
          onMoveError={vi.fn()}
          onRename={vi.fn()}
          onRenameError={vi.fn()}
          onContextMenu={vi.fn()}
        />
      )
    )
    const folder = host.querySelector<HTMLElement>('[data-item-path="docs/"]')!
    await act(async () => folder.click())
    expect(onLoadDirectory).toHaveBeenCalledTimes(1)
    expect(currentDecoration()).toMatchObject({ text: "Loading…" })
    expect(host.querySelector('[role="status"]')?.textContent).toBe(
      "Loading docs…"
    )
    await act(async () => rejectFirst(new Error("Disk unavailable")))
    expect(currentDecoration()).toMatchObject({
      text: "Retry",
      title: "Disk unavailable",
    })
    expect(host.querySelector('[role="status"]')?.textContent).toBe(
      "Could not load docs. Click the folder to retry."
    )
    await act(async () => folder.click())
    expect(onLoadDirectory).toHaveBeenCalledTimes(2)
    expect(currentDecoration()).toMatchObject({ text: "Loading…" })
    await act(async () => resolveRetry())
    expect(currentDecoration()).toBeNull()
  } finally {
    await act(async () => root.unmount())
    decoration.mockRestore()
    host.remove()
  }
})
