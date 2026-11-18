// @vitest-environment jsdom
import { act, useState } from "react"
import { createRoot } from "react-dom/client"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { FileTree } from "@pierre/trees"
import type { SpaceSnapshot } from "../shared/contracts"
import { SpaceSession } from "../main/space/space-session"
import { SpaceFileTree } from "./space-file-tree"
import { useExplorerClipboard } from "./use-explorer-clipboard"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
const graft = {
  backend: "sdk",
  expectedVersion: () => "test",
  hasOpenSession: () => false,
  close: async () => undefined,
}

async function recordVector(name: string, vector: Record<string, unknown>) {
  const directory = process.env.EIDOS_LITE_EXPLORER_MENU_TEST_EVIDENCE
  if (!directory) return
  if (!path.isAbsolute(directory))
    throw new Error("Keyboard evidence directory must be absolute")
  await fs.mkdir(directory, { recursive: true })
  await fs.writeFile(
    path.join(directory, `keyboard-${name}.json`),
    JSON.stringify(vector, null, 2) + "\n"
  )
}

async function setup(macos: boolean, nested: boolean) {
  for (const name of ["ResizeObserver", "IntersectionObserver"])
    vi.stubGlobal(
      name,
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    )
  const directory = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "t03-root-paste-"))
  )
  const spaceRoot = path.join(directory, "Space")
  await fs.mkdir(path.join(spaceRoot, "visible/source"), { recursive: true })
  await fs.mkdir(path.join(spaceRoot, "visible/other/nested"), {
    recursive: true,
  })
  for (const name of ["a.txt", "b.txt"])
    await fs.writeFile(path.join(spaceRoot, "visible/source", name), name)
  const session = await SpaceSession.create(
    spaceRoot,
    path.join(directory, "state"),
    { graft: graft as never }
  )
  await session.loadDirectory("visible")
  await session.loadDirectory("visible/source")
  await session.loadDirectory("visible/other")
  await session.loadDirectory("visible/other/nested")
  const initial = await session.snapshot()
  ;(session as unknown as { watcher: { close(): void } }).watcher.close()
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const resets = vi.spyOn(FileTree.prototype, "resetPaths")
  const errors = vi.fn()
  const selected = vi.fn()
  const context = vi.fn()
  const nativeState = vi.fn()
  let nativeCommand: (command: "cut" | "copy" | "paste") => boolean = () =>
    false
  const previousApi = Object.getOwnPropertyDescriptor(window, "eidosLite")
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
  let pending: Promise<unknown> | undefined
  const moves = vi.spyOn(session, "movePaths")
  const copies = vi.spyOn(session, "copyPath")
  let clipboard!: ReturnType<typeof useExplorerClipboard>
  let setScope!: (id: string) => void
  let setFilter!: (query: string) => void
  let setVisible!: (visible: boolean) => void
  function Harness() {
    const [snapshot, setSnapshot] = useState<SpaceSnapshot>(initial)
    const [scope, updateScope] = useState(initial.id)
    const [query, updateFilter] = useState("")
    const [visible, updateVisible] = useState(true)
    setScope = updateScope
    setFilter = updateFilter
    setVisible = updateVisible
    clipboard = useExplorerClipboard({
      spaceId: scope,
      entries: snapshot.entries,
      disabled: false,
      prepare: (paths) => {
        const preparing = session.preparePathClipboard(paths)
        pending = preparing
        return preparing
      },
      move: (paths, target, complete, sources) => {
        const operation = (async () => {
          const result = await session.movePaths(paths, target, sources)
          complete(result.moves.map((move) => move.source))
          setSnapshot(result.snapshot)
          if (result.failure) throw new Error(result.failure.message)
        })()
        pending = operation
        return operation
      },
      copy: (source, target, sources) => {
        const operation = session
          .copyPath(source, target, sources)
          .then((result) => {
            setSnapshot(result.snapshot)
            return { refreshError: result.refreshError }
          })
        pending = operation
        return operation
      },
      onError: errors,
    })
    return (
      <SpaceFileTree
        key={scope}
        entries={
          nested
            ? (snapshot.entries.find(
                (entry) => entry.relativePath === "visible"
              )?.children ?? [])
            : snapshot.entries
        }
        spaceId={scope}
        rootDirectory={nested ? "visible" : null}
        clipboard={clipboard}
        macos={macos}
        nameQuery={query}
        visible={visible}
        activePath={null}
        renameRequest={null}
        onSelect={selected}
        onOpen={vi.fn()}
        onLoadDirectory={async () => {}}
        onMove={vi.fn()}
        onMoveError={errors}
        onRename={vi.fn()}
        onRenameError={errors}
        onContextMenu={context}
        onRootContextMenu={vi.fn()}
      />
    )
  }
  await act(async () => root.render(<Harness />))
  const model = resets.mock.contexts[0]!
  if (!(model instanceof FileTree)) throw new Error("Missing tree model")
  const tree = () => host.querySelector<HTMLElement>("[data-space-file-tree]")!
  const shadow = () => tree().shadowRoot!
  const row = (relative: string) =>
    shadow().querySelector<HTMLElement>(
      `[data-item-path="${nested ? relative.replace(/^visible\//, "") : relative}"]`
    )!
  const drain = async () => {
    let current: Promise<unknown> | undefined
    do {
      current = pending
      await current?.catch(() => undefined)
      await Promise.resolve()
    } while (pending !== current)
  }
  const activeElement = () => {
    let active = document.activeElement!
    while (active.shadowRoot?.activeElement)
      active = active.shadowRoot.activeElement
    return active
  }
  const key = async (key: string, target: Element = activeElement()) => {
    const event = new KeyboardEvent("keydown", {
      key,
      code: `Key${key.toUpperCase()}`,
      bubbles: true,
      composed: true,
      cancelable: true,
      ...(macos ? { metaKey: true } : { ctrlKey: true }),
    })
    await act(async () => {
      target.dispatchEvent(event)
      await drain()
    })
    return event
  }
  const select = async (paths: string[]) => {
    await act(async () => {
      for (const selected of model.getSelectedPaths())
        model.getItem(selected)?.deselect()
      for (const selected of paths) {
        const treePath = nested ? selected.replace(/^visible\//, "") : selected
        const parts = treePath.replace(/\/$/, "").split("/")
        for (let index = 1; index < parts.length; index++) {
          const parent = model.getItem(parts.slice(0, index).join("/") + "/")
          if (parent && "expand" in parent) parent.expand()
        }
        model.getItem(treePath)?.select()
      }
    })
    await act(async () => {
      const last = paths.at(-1)!
      model.getItem(nested ? last.replace(/^visible\//, "") : last)?.focus()
      row(last).focus()
    })
  }
  const blank = async (insideShadow = true) => {
    const target = insideShadow
      ? shadow().querySelector<HTMLElement>(
          "[data-file-tree-virtualized-scroll]"
        )!
      : tree()
    expect(target).toBeTruthy()
    const event = new MouseEvent("pointerdown", {
      button: 0,
      bubbles: true,
      composed: true,
      cancelable: true,
    })
    await act(async () => {
      target.dispatchEvent(event)
      // Model the browser's default focus handoff, which used to restore the old target.
      if (!event.defaultPrevented) target.focus()
    })
    expect(activeElement()).toBe(host.querySelector(".space-file-tree-shell"))
    expect(model.getSelectedPaths()).toEqual([])
    expect(selected).toHaveBeenLastCalledWith(null)
  }
  return {
    spaceRoot,
    host,
    session,
    model,
    row,
    key,
    select,
    blank,
    drain,
    errors,
    context,
    nativeState,
    clipboard: () => clipboard,
    nativePaste: async () =>
      act(async () => {
        expect(nativeCommand("paste")).toBe(true)
        await drain()
      }),
    contextMenu: async (relative: string) =>
      act(async () => {
        row(relative).dispatchEvent(
          new MouseEvent("contextmenu", {
            bubbles: true,
            composed: true,
            cancelable: true,
          })
        )
      }),
    switchSpace: async () => act(async () => setScope("another-space")),
    hideTree: async () => act(async () => setVisible(false)),
    nativeHandled: () => nativeCommand("paste"),
    filter: async (query: string) => act(async () => setFilter(query)),
    moves,
    copies,
    close: async () => {
      await act(async () => root.unmount())
      host.remove()
      if (previousApi) Object.defineProperty(window, "eidosLite", previousApi)
      else Reflect.deleteProperty(window, "eidosLite")
      await session.close()
      await fs.rm(directory, { recursive: true, force: true })
    },
  }
}

it.each([
  { macos: true, mode: "cut", nested: false },
  { macos: false, mode: "cut", nested: false },
  { macos: true, mode: "copy", nested: false },
  { macos: false, mode: "copy", nested: false },
  { macos: true, mode: "cut", nested: true },
  { macos: false, mode: "cut", nested: true },
  { macos: true, mode: "copy", nested: true },
  { macos: false, mode: "copy", nested: true },
] as const)(
  "$mode → blank → keyboard paste writes actual Space root (mac=$macos, nested/multi=$nested)",
  async ({ macos, mode, nested }) => {
    const f = await setup(macos, nested)
    const names = nested ? ["a.txt", "b.txt"] : ["a.txt"]
    try {
      await f.select(names.map((name) => `visible/source/${name}`))
      expect((await f.key(mode === "cut" ? "x" : "c")).defaultPrevented).toBe(
        true
      )
      for (const name of names)
        expect(
          await fs.readFile(
            path.join(f.spaceRoot, "visible/source", name),
            "utf8"
          )
        ).toBe(name)
      await f.select(["visible/other/nested/"])
      await f.contextMenu("visible/other/nested/")
      expect(f.context).toHaveBeenCalled()
      const input = document.createElement("textarea")
      f.host.append(input)
      input.focus()
      expect((await f.key("v", input)).defaultPrevented).toBe(false)
      expect(f.moves).not.toHaveBeenCalled()
      expect(f.copies).not.toHaveBeenCalled()
      await f.blank(mode === "cut")
      expect(f.nativeState).toHaveBeenLastCalledWith({
        cut: false,
        copy: false,
        paste: true,
      })
      expect((await f.key("v")).defaultPrevented).toBe(true)
      for (const name of names) {
        expect(await fs.readFile(path.join(f.spaceRoot, name), "utf8")).toBe(
          name
        )
        await expect(
          fs.stat(path.join(f.spaceRoot, "visible/other/nested", name))
        ).rejects.toThrow()
        if (mode === "cut")
          await expect(
            fs.stat(path.join(f.spaceRoot, "visible/source", name))
          ).rejects.toThrow()
        else
          expect(
            await fs.readFile(
              path.join(f.spaceRoot, "visible/source", name),
              "utf8"
            )
          ).toBe(name)
      }
      const calls = mode === "cut" ? f.moves.mock.calls : f.copies.mock.calls
      expect(calls.every((call) => call[1] === null)).toBe(true)
      expect(f.errors).not.toHaveBeenCalled()
      await recordVector(
        `${macos ? "cmd" : "ctrl"}-${mode}-${nested ? "nested-multi" : "single"}`,
        {
          mode,
          primaryModifier: macos ? "Cmd" : "Ctrl",
          displayedDirectory: nested ? "visible" : null,
          priorContextDirectory: "visible/other/nested",
          inputPasteIntercepted: false,
          blankClearedSelectionAndFocusedRoot: true,
          actualHostTargets: calls.map((call) => call[1]),
          files: await Promise.all(
            names.map(async (name) => ({
              name,
              rootContent: await fs.readFile(
                path.join(f.spaceRoot, name),
                "utf8"
              ),
              sourceExists: await fs
                .stat(path.join(f.spaceRoot, "visible/source", name))
                .then(
                  () => true,
                  () => false
                ),
              staleTargetExists: await fs
                .stat(path.join(f.spaceRoot, "visible/other/nested", name))
                .then(
                  () => true,
                  () => false
                ),
            }))
          ),
          errors: f.errors.mock.calls,
        }
      )
      input.remove()
    } finally {
      await f.close()
    }
  }
)

it("blank native Edit paste shares the root target; an explicit folder restores folder paste; Space switch invalidates the buffer", async () => {
  const f = await setup(true, true)
  try {
    await f.select(["visible/source/a.txt"])
    await f.key("c")
    await f.filter("other")
    await f.blank()
    await f.filter("")
    expect(f.model.getSelectedPaths()).toEqual([])
    await f.nativePaste()
    expect(await fs.readFile(path.join(f.spaceRoot, "a.txt"), "utf8")).toBe(
      "a.txt"
    )
    await f.select(["visible/other/nested/"])
    await f.key("v")
    expect(
      await fs.readFile(
        path.join(f.spaceRoot, "visible/other/nested/a.txt"),
        "utf8"
      )
    ).toBe("a.txt")
    expect(f.copies.mock.calls.at(-1)?.[1]).toBe("visible/other/nested")
    await f.switchSpace()
    expect(f.clipboard().clipboard).toBeNull()
    const shell = f.host.querySelector<HTMLElement>(".space-file-tree-shell")!
    shell.focus()
    expect((await f.key("v")).defaultPrevented).toBe(false)
    await recordVector("native-folder-filter-space-switch", {
      nativeRootPasteContent: await fs.readFile(
        path.join(f.spaceRoot, "a.txt"),
        "utf8"
      ),
      explicitFolderPasteContent: await fs.readFile(
        path.join(f.spaceRoot, "visible/other/nested/a.txt"),
        "utf8"
      ),
      actualHostTargets: f.copies.mock.calls.map((call) => call[1]),
      blankAfterNameFilterKeepsClearedSelection: true,
      clipboardAfterSpaceSwitch: f.clipboard().clipboard,
    })
  } finally {
    await f.close()
  }
})

it("a hidden tree cannot intercept paste after Explorer switches to another layout", async () => {
  const f = await setup(true, false)
  try {
    await f.select(["visible/source/a.txt"])
    await f.key("x")
    await f.blank()
    await f.hideTree()
    expect(f.nativeHandled()).toBe(false)
    const shell = f.host.querySelector<HTMLElement>(".space-file-tree-shell")!
    expect((await f.key("v", shell)).defaultPrevented).toBe(false)
    expect(f.moves).not.toHaveBeenCalled()
    await recordVector("hidden-layout-guard", {
      nativeHandled: false,
      keyboardIntercepted: false,
      hostMoves: f.moves.mock.calls,
    })
    expect(
      await fs.readFile(path.join(f.spaceRoot, "visible/source/a.txt"), "utf8")
    ).toBe("a.txt")
  } finally {
    await f.close()
  }
})
