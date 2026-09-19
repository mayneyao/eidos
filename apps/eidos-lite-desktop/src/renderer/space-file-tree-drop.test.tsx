// @vitest-environment jsdom
import { act, type HTMLAttributes } from "react"
import { createRoot } from "react-dom/client"
import { SpaceFileTree } from "./space-file-tree"
import { EIDOS_LITE_SPACE_PATH_DRAG_TYPE } from "./space-path-drag"

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
      </div>
    ),
    useFileTree: () => ({
      model: useMemo(
        () => new FileTree({ paths: [], initialExpansion: "closed" }),
        []
      ),
    }),
    useFileTreeSelection: () => [],
  }
})
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

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
  try {
    await render()
    const tree = host.firstElementChild!
    for (const [target, directory] of [
      [tree, null],
      [tree.children[0]!, "docs"],
      [tree.children[1]!, "docs"],
    ] as const) {
      expect((await drop(target)).defaultPrevented).toBe(true)
      expect(onImportFiles).toHaveBeenLastCalledWith([file], directory)
    }
    expect(onImportFiles).toHaveBeenCalledTimes(3)
    expect(
      (await drop(tree, [EIDOS_LITE_SPACE_PATH_DRAG_TYPE])).defaultPrevented
    ).toBe(false)
    await render(true)
    await drop(tree)
    expect(onImportFiles).toHaveBeenCalledTimes(3)
  } finally {
    act(() => root.unmount())
    host.remove()
  }
})
