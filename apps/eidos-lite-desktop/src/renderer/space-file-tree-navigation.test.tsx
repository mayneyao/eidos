// @vitest-environment jsdom
import { act, StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { FileTree as TreeModel } from "@pierre/trees"
import type { SpaceTreeEntry } from "../shared/contracts"
import { SpaceFileTree } from "./space-file-tree"

vi.mock("@pierre/trees/react", async () => {
  const { useMemo } = await import("react")
  const { FileTree } = await import("@pierre/trees")
  return {
    FileTree: () => null,
    useFileTree: () => ({
      model: useMemo(
        () =>
          new FileTree({
            paths: [],
            initialExpansion: "closed",
            flattenEmptyDirectories: false,
          }),
        []
      ),
    }),
    useFileTreeSelection: (model: InstanceType<typeof FileTree>) =>
      model.getSelectedPaths(),
  }
})

const file = (path: string): SpaceTreeEntry => ({
  name: path.split("/").at(-1)!,
  relativePath: path,
  kind: "file",
  size: 1,
  modifiedAtMs: 1,
})
const folder = (children: SpaceTreeEntry[]): SpaceTreeEntry => ({
  name: "top",
  relativePath: "top",
  kind: "directory",
  size: 0,
  modifiedAtMs: 1,
  children,
  childrenLoaded: children.length > 0,
})

it("reveals navigation once, preserves folder browsing, and retries when a missing document arrives", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const scroll = vi
    .spyOn(TreeModel.prototype, "scrollToPath")
    .mockImplementation(() => {})
  const host = document.createElement("div")
  const root = createRoot(host)
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
  const render = async (
    entries: SpaceTreeEntry[],
    activePath: string | null,
    revealToken = 0
  ) => {
    await act(async () =>
      root.render(
        <StrictMode>
          <SpaceFileTree
            entries={entries}
            activePath={activePath}
            revealToken={revealToken}
            renameRequest={null}
            {...callbacks}
          />
        </StrictMode>
      )
    )
  }
  try {
    const readme = file("readme.md")
    await render([folder([]), readme], "readme.md")
    expect(scroll).toHaveBeenCalledTimes(1)
    // Loading an expanded folder changes paths without changing the open file.
    await render([folder([file("top/new.md")]), readme], "readme.md")
    expect(scroll).toHaveBeenCalledTimes(1)
    await render([folder([file("top/new.md")]), readme], "top/new.md")
    expect(scroll).toHaveBeenCalledTimes(2)
    expect(scroll).toHaveBeenLastCalledWith("top/new.md", {
      offset: "nearest",
      focus: false,
    })
    await render([folder([]), readme], "missing.md")
    expect(scroll).toHaveBeenCalledTimes(2)
    await render([folder([]), readme, file("missing.md")], "missing.md")
    expect(scroll).toHaveBeenCalledTimes(3)
    await render([readme], null)
    await render([readme], "readme.md")
    expect(scroll).toHaveBeenCalledTimes(4)
    await render([readme], "readme.md", 1)
    expect(scroll).toHaveBeenCalledTimes(5)
    await render([readme, file("other.md")], "readme.md", 1)
    expect(scroll).toHaveBeenCalledTimes(5)
  } finally {
    await act(async () => root.unmount())
    scroll.mockRestore()
  }
})
