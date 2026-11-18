// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { FileTree } from "@pierre/trees"
import { SpaceFileTree } from "./space-file-tree"
import { useExplorerClipboard } from "./use-explorer-clipboard"
import { ExplorerClipboardMenu } from "./explorer-clipboard-menu"
import { EidosLiteI18nProvider } from "./i18n"
import type { SpaceTreeEntry } from "../shared/contracts"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
const file = (
  name: string,
  kind: SpaceTreeEntry["kind"] = "file"
): SpaceTreeEntry => ({
  name,
  relativePath: name,
  kind,
  size: 0,
  modifiedAtMs: 0,
})

async function setup(macos = false) {
  for (const name of ["ResizeObserver", "IntersectionObserver"])
    vi.stubGlobal(
      name,
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    )
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  let nativeCommand: (command: "cut" | "copy" | "paste") => boolean = () =>
    false
  const previousApi = Object.getOwnPropertyDescriptor(window, "eidosLite")
  const nativeState = vi.fn()
  Object.defineProperty(window, "eidosLite", {
    configurable: true,
    value: {
      setClipboardCommandState: nativeState,
      onClipboardCommand: (listener: typeof nativeCommand) => {
        nativeCommand = listener
        return () => {
          nativeCommand = () => false
        }
      },
    },
  })
  const resets = vi.spyOn(FileTree.prototype, "resetPaths")
  const move = vi
    .fn<Parameters<typeof useExplorerClipboard>[0]["move"]>()
    .mockImplementation(async (paths, _target, complete) => {
      complete(paths)
    })
  const copy = vi
    .fn<Parameters<typeof useExplorerClipboard>[0]["copy"]>()
    .mockResolvedValue()
  const onError = vi.fn()
  const onRename = vi.fn().mockResolvedValue(undefined)
  const onRootContextMenu = vi.fn()
  let commands!: ReturnType<typeof useExplorerClipboard>
  let spaceId = "space-a"
  const prepare = vi
    .fn<NonNullable<Parameters<typeof useExplorerClipboard>[0]["prepare"]>>()
    .mockImplementation(async (paths) => ({
      spaceId,
      sources: paths.map((relativePath) => ({
        relativePath,
        token: `token:${relativePath}`,
      })),
    }))
  const entries = [
    file("a.mp4"),
    file("b.txt"),
    { ...file("folder.ext", "directory"), children: [], childrenLoaded: true },
  ]
  function Harness() {
    commands = useExplorerClipboard({
      spaceId,
      disabled: false,
      move,
      copy,
      prepare,
      onError,
    })
    return (
      <SpaceFileTree
        entries={entries}
        spaceId={spaceId}
        macos={macos}
        clipboard={commands}
        activePath={null}
        renameRequest={null}
        onOpen={vi.fn()}
        onSelect={vi.fn()}
        onLoadDirectory={vi.fn()}
        onMove={vi.fn()}
        onMoveError={vi.fn()}
        onRename={onRename}
        onRenameError={vi.fn()}
        onContextMenu={vi.fn()}
        onRootContextMenu={onRootContextMenu}
      />
    )
  }
  const render = async () =>
    act(async () => {
      root.render(<Harness />)
    })
  await render()
  const model = resets.mock.contexts[0]!
  if (!(model instanceof FileTree)) throw new Error("Missing tree model")
  const shadow = () => host.querySelector("[data-space-file-tree]")!.shadowRoot!
  const row = (path: string) =>
    shadow().querySelector<HTMLElement>(`[data-item-path="${path}"]`)!
  const key = async (
    node: Element,
    key: string,
    options: KeyboardEventInit = {}
  ) => {
    const event = new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      composed: true,
      cancelable: true,
      ...options,
    })
    await act(async () => {
      node.dispatchEvent(event)
    })
    return event
  }
  return {
    host,
    root,
    model,
    row,
    shadow,
    key,
    move,
    copy,
    prepare,
    onError,
    onRename,
    onRootContextMenu,
    nativeState,
    nativeCommand: (command: "cut" | "copy" | "paste") =>
      nativeCommand(command),
    commands: () => commands,
    switchSpace: async () => {
      spaceId = "space-b"
      await render()
    },
    close: async () => {
      await act(async () => root.unmount())
      host.remove()
      if (previousApi) Object.defineProperty(window, "eidosLite", previousApi)
      else Reflect.deleteProperty(window, "eidosLite")
    },
  }
}

it.each([false, true])(
  "routes tree cut/copy/paste with platform primary keys (mac=%s), keeps copies and clears only successful cuts",
  async (macos) => {
    const tree = await setup(macos)
    const modifier = macos ? { metaKey: true } : { ctrlKey: true }
    try {
      await act(async () => {
        tree.model.getItem("a.mp4")!.select()
        tree.model.getItem("b.txt")!.select()
      })
      expect(
        (await tree.key(tree.row("a.mp4"), "x", modifier)).defaultPrevented
      ).toBe(true)
      expect(tree.move).not.toHaveBeenCalled()
      expect(tree.row("a.mp4").hasAttribute("data-clipboard-cut")).toBe(true)
      tree.move.mockImplementationOnce(async (_paths, _target, completed) => {
        completed(["a.mp4"])
        throw new Error("b.txt failed")
      })
      await tree.key(tree.row("folder.ext/"), "v", modifier)
      expect(tree.move).toHaveBeenCalledWith(
        ["a.mp4", "b.txt"],
        "folder.ext",
        expect.any(Function),
        expect.objectContaining({
          spaceId: "space-a",
          sources: expect.any(Array),
        })
      )
      expect(
        tree.commands().clipboard?.entries.map((entry) => entry.relativePath)
      ).toEqual(["b.txt"])
      expect(tree.onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: "b.txt failed" })
      )
      await tree.key(tree.row("a.mp4"), "c", modifier)
      await tree.key(tree.row("folder.ext/"), "v", modifier)
      await tree.key(tree.row("folder.ext/"), "v", modifier)
      expect(tree.copy).toHaveBeenCalledTimes(4)
      expect(tree.commands().clipboard?.mode).toBe("copy")
      await tree.switchSpace()
      expect(tree.commands().clipboard).toBeNull()
      expect(
        (await tree.key(tree.row("folder.ext/"), "v", modifier))
          .defaultPrevented
      ).toBe(false)
    } finally {
      await tree.close()
    }
  }
)

it("handles Edit-menu clipboard events only on the tree and retains native rename text editing", async () => {
  const tree = await setup()
  try {
    await act(async () => tree.model.getItem("a.mp4")!.select())
    await act(async () => tree.row("a.mp4").focus())
    await act(async () => {
      expect(tree.nativeCommand("copy")).toBe(true)
    })
    expect(tree.commands().clipboard?.mode).toBe("copy")
    expect(tree.nativeState).toHaveBeenLastCalledWith({
      cut: true,
      copy: true,
      paste: false,
    })
    await act(async () => {
      tree.model.getItem("folder.ext/")!.focus()
      tree.row("folder.ext/").focus()
    })
    expect(tree.nativeState).toHaveBeenLastCalledWith({
      cut: true,
      copy: true,
      paste: true,
    })
    const copy = new Event("copy", {
      bubbles: true,
      composed: true,
      cancelable: true,
    })
    await act(async () => {
      tree.row("a.mp4").dispatchEvent(copy)
    })
    expect(copy.defaultPrevented).toBe(true)
    await act(async () => tree.model.startRenaming("a.mp4"))
    const input = tree
      .shadow()
      .querySelector<HTMLInputElement>("[data-item-rename-input]")!
    expect(input).toBeTruthy()
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 1])
    expect(tree.nativeCommand("paste")).toBe(false)
    expect(tree.nativeState).toHaveBeenLastCalledWith(null)
    for (const key of ["x", "c", "v"])
      expect(
        (await tree.key(input, key, { ctrlKey: true })).defaultPrevented
      ).toBe(false)
    const textCopy = new Event("copy", {
      bubbles: true,
      composed: true,
      cancelable: true,
    })
    input.dispatchEvent(textCopy)
    expect(textCopy.defaultPrevented).toBe(false)
    await tree.key(input, "Escape")
    expect(tree.onRename).not.toHaveBeenCalled()
    await act(async () => tree.model.startRenaming("a.mp4"))
    const renamed = tree
      .shadow()
      .querySelector<HTMLInputElement>("[data-item-rename-input]")!
    renamed.value = "new.mp4"
    await act(async () => {
      renamed.dispatchEvent(
        new Event("input", { bubbles: true, composed: true })
      )
    })
    await tree.key(renamed, "Enter")
    expect(tree.onRename).toHaveBeenCalledWith(
      expect.objectContaining({ name: "a.mp4" }),
      "new.mp4"
    )
  } finally {
    await tree.close()
  }
})

it("does not intercept text elsewhere and targets blank/root paste at the current directory", async () => {
  const tree = await setup()
  try {
    await act(async () => tree.commands().capture("copy", [file("a.mp4")]))
    for (const tag of ["input", "textarea", "div"]) {
      const node = document.createElement(tag)
      if (tag === "div") node.setAttribute("contenteditable", "true")
      tree.host.append(node)
      expect(
        (await tree.key(node, "v", { ctrlKey: true })).defaultPrevented
      ).toBe(false)
      node.remove()
    }
    // A root-level source pasted into the same directory is disabled.
    expect(tree.commands().canPaste(null)).toBe(false)
    const shell = tree.host.querySelector<HTMLElement>(
      ".space-file-tree-shell"
    )!
    await act(async () => {
      shell.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: 30,
          clientY: 40,
        })
      )
    })
    expect(tree.onRootContextMenu).toHaveBeenCalledWith(30, 40)
    await act(async () =>
      tree
        .commands()
        .capture("copy", [{ ...file("a.mp4"), relativePath: "nested/a.mp4" }])
    )
    await tree.key(shell, "v", { ctrlKey: true })
    expect(tree.copy).toHaveBeenCalledWith(
      "nested/a.mp4",
      null,
      expect.objectContaining({ spaceId: "space-a" })
    )
  } finally {
    await tree.close()
  }
})

it("retains copies after partial failure and discards late preparations from another Space", async () => {
  const tree = await setup()
  try {
    await act(async () =>
      tree.commands().capture("copy", [file("a.mp4"), file("b.txt")])
    )
    tree.copy
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(new Error("target exists"))
    await act(async () => tree.commands().paste("folder.ext"))
    expect(tree.onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Copied 1 of 2 items. target exists" })
    )
    expect(tree.commands().clipboard?.entries).toHaveLength(2)
    tree.copy
      .mockReset()
      .mockResolvedValueOnce({ refreshError: "unreadable folder" })
    await act(async () => tree.commands().paste("folder.ext"))
    expect(tree.copy).toHaveBeenCalledOnce()
    expect(tree.onError).toHaveBeenLastCalledWith(
      expect.objectContaining({
        message:
          "Copied 1 of 2 items. The files were copied, but the folder could not be refreshed. unreadable folder",
      })
    )
    let finish!: (
      sources: Awaited<
        ReturnType<
          NonNullable<Parameters<typeof useExplorerClipboard>[0]["prepare"]>
        >
      >
    ) => void
    tree.prepare.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    await act(async () => {
      void tree.commands().capture("cut", [file("a.mp4")])
    })
    expect(tree.commands().canPaste("folder.ext")).toBe(false)
    await tree.switchSpace()
    await act(async () => {
      finish({
        spaceId: "space-a",
        sources: [{ relativePath: "a.mp4", token: "old" }],
      })
    })
    expect(tree.commands().clipboard).toBeNull()
  } finally {
    await tree.close()
  }
})

it("shows Chinese clipboard menu labels with platform shortcuts", async () => {
  Object.defineProperty(window, "eidosLite", {
    configurable: true,
    value: {
      getPreferences: async () => ({ language: "zh" }),
      onPreferencesChanged: () => () => undefined,
    },
  })
  const host = document.createElement("div")
  const root = createRoot(host)
  try {
    await act(async () =>
      root.render(
        <EidosLiteI18nProvider>
          <ExplorerClipboardMenu
            macos
            canCapture
            canPaste
            onCommand={vi.fn()}
          />
        </EidosLiteI18nProvider>
      )
    )
    expect(host.textContent).toContain("剪切")
    expect(host.textContent).toContain("复制")
    expect(host.textContent).toContain("粘贴")
    expect(host.textContent).toContain("⌘C")
  } finally {
    await act(async () => root.unmount())
  }
})
