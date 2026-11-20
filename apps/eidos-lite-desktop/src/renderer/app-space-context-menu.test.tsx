// @vitest-environment jsdom
import { act, useEffect, type ComponentProps } from "react"
import { createRoot } from "react-dom/client"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import type { EidosFileSnapshot } from "@eidos.space/eidos-file"
import type { EidosLiteApi } from "../shared/contracts"
import { SpaceSession } from "../main/space/space-session"
import type { SpaceFileTree } from "./space-file-tree"
import { DEFAULT_RENDERER_PREFERENCES } from "./app-appearance"
import { navigationHash } from "./navigation-history"
import { EidosLiteI18nProvider } from "./i18n"
import { textDraftLifecycle } from "./text-draft-lifecycle"

// The real App, heading, root/row menus, dialogs and clipboard hook run here.
// The tree's public callbacks are exposed without a virtualized layout; the
// real shadow tree's keyboard/root selection path has its own regression suite.
const tree = vi.hoisted(() =>
  vi.fn<(props: ComponentProps<typeof SpaceFileTree>) => void>()
)
const expansion = vi.hoisted(() => ({ expanded: false, toggle: vi.fn() }))
vi.mock("./space-file-tree", () => ({
  SpaceFileTree: (props: ComponentProps<typeof SpaceFileTree>) => {
    tree(props)
    useEffect(() => {
      props.onExpansionActionsChange?.({
        scope: "all",
        isExpanded: () => expansion.expanded,
        toggle: () => {
          expansion.expanded = !expansion.expanded
          expansion.toggle()
        },
      })
      return () => props.onExpansionActionsChange?.(null)
    }, [props.onExpansionActionsChange])
    return <div data-test-tree tabIndex={0} />
  },
}))
vi.mock("./markdown-editor-surface", () => ({
  prepareMarkdownEditorSurface: async () => undefined,
  MarkdownEditorSurface: () => <div data-test-markdown />,
}))
vi.mock("./eidos-file-workbench", () => ({
  EidosFileWorkbench: ({
    metadataDirectory,
  }: {
    metadataDirectory?: string
  }) => <div data-test-metadata-scope={metadataDirectory} />,
}))
vi.mock("./terminal-panel", () => ({
  TerminalPanel: () => <div data-test-terminal />,
}))
import { App } from "./app"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function setup({
  readOnly = false,
  language = "en",
  platform = "darwin",
  terminal = false,
  folders = true,
  layout = "tree",
} = {}) {
  window.localStorage.clear()
  window.sessionStorage.clear()
  window.localStorage.setItem("eidos-lite:explorer-layout", layout)
  tree.mockClear()
  expansion.expanded = false
  expansion.toggle.mockClear()
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }))
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  const directory = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "t03-space-menu-"))
  )
  const spaceRoot = path.join(directory, "Space")
  await fs.mkdir(spaceRoot)
  if (folders) {
    await fs.mkdir(path.join(spaceRoot, "visible/deep"), { recursive: true })
    await fs.writeFile(
      path.join(spaceRoot, "visible/deep/source.txt"),
      "clipboard source"
    )
  }
  const imported = path.join(directory, "imported.txt")
  await fs.writeFile(imported, "import source")
  const session = await SpaceSession.create(
    spaceRoot,
    path.join(directory, "state"),
    {
      graft: {
        backend: "sdk",
        expectedVersion: () => "test",
        hasOpenSession: () => false,
        close: async () => undefined,
      } as never,
      readOnly,
    }
  )
  if (folders) {
    await session.loadDirectory("visible")
    await session.loadDirectory("visible/deep")
  }
  ;(session as unknown as { watcher: { close(): void } }).watcher.close()
  const initial = await session.snapshot()
  window.history.replaceState(null, "", navigationHash(initial.id, null))
  const metadata = {
    path: ".eidos/files.eidos",
    metadata: { fileId: "metadata", title: "Files", revision: 1 },
    tables: [
      {
        table: { id: "files", name: "Files", settings: {} },
        fields: [],
        views: [],
        rowCount: 0,
      },
    ],
  } as unknown as EidosFileSnapshot
  let pending: Promise<unknown> | undefined
  const track = <T,>(operation: Promise<T>) => {
    pending = operation
    return operation
  }
  const drain = async () => {
    let current: Promise<unknown> | undefined
    do {
      current = pending
      await current?.catch(() => undefined)
      await Promise.resolve()
    } while (current !== pending)
  }
  const methods = {
    systemLocale: "en-US",
    getPreferences: async () => ({
      ...DEFAULT_RENDERER_PREFERENCES,
      language,
      builtInPlugins: { terminal },
    }),
    getAppInfo: async () => ({
      platform,
      version: "test",
      systemLocale: "en-US",
      services: { name: "staging" },
    }),
    getSpace: () => session.snapshot(),
    filterSpaceFiles: (...args: Parameters<EidosLiteApi["filterSpaceFiles"]>) =>
      session.filterFiles(...args),
    listExplorerFiles: (
      query: Parameters<EidosLiteApi["listExplorerFiles"]>[0]
    ) => session.listExplorerFiles(query),
    loadSpaceDirectory: (directory: string) => session.loadDirectory(directory),
    listPlugins: async () => ({ plugins: [], space: { id: initial.id } }),
    listRecentSpaces: async () => [],
    listPublicationBindings: async () => [],
    getAccountStatus: async () => ({ signedIn: false }),
    getUpdateStatus: async () => ({ state: "idle" }),
    getSyncQueueStatus: async () => null,
    getSyncMergeStatus: async () => ({ ok: true, value: { state: "none" } }),
    takeLaunchEidosFile: async () => null,
    getPluginInstallIntent: async () => null,
    setNavigationCapabilities: vi.fn(async () => undefined),
    setFormatterContext: vi.fn(async () => undefined),
    setPluginShortcuts: vi.fn(async () => []),
    setSyncDraftState: vi.fn(),
    setClipboardCommandState: vi.fn(),
    selectFileProperties: vi.fn(async () => undefined),
    createTextFile: vi.fn(
      (...args: Parameters<EidosLiteApi["createTextFile"]>) =>
        track(session.createTextFile(...args))
    ),
    createFolder: vi.fn((...args: Parameters<EidosLiteApi["createFolder"]>) =>
      track(session.createFolder(...args))
    ),
    importFiles: vi.fn((target: string | null) =>
      track(session.importFiles([imported], target))
    ),
    preparePathClipboard: (paths: string[]) =>
      track(session.preparePathClipboard(paths)),
    copyPath: vi.fn((...args: Parameters<EidosLiteApi["copyPath"]>) =>
      track(session.copyPath(...args))
    ),
    movePaths: vi.fn((...args: Parameters<EidosLiteApi["movePaths"]>) =>
      track(session.movePaths(...args))
    ),
    revealPath: vi.fn(async () => undefined),
    previewTextFile: (relative: string) =>
      track(session.previewTextFile(relative)),
    openPluginEditor: async () => ({ instance: null }),
    inspectEidosFileIssue: async () => null,
    openFileMetadata: vi.fn(async () => ({
      sessionId: "metadata",
      relativePath: ".eidos/files.eidos",
      readOnly,
      snapshot: metadata,
    })),
    callRuntime: async () => metadata,
    closeEidosFile: async () => undefined,
  }
  const previousApi = Object.getOwnPropertyDescriptor(window, "eidosLite")
  Object.defineProperty(window, "eidosLite", {
    configurable: true,
    value: new Proxy(methods, {
      get(target, name: string) {
        if (name in target) return target[name as keyof typeof target]
        if (name.startsWith("on")) return () => () => undefined
        throw new Error(`Unexpected host call: ${name}`)
      },
    }),
  })
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  await act(async () =>
    root.render(
      <EidosLiteI18nProvider>
        <App />
      </EidosLiteI18nProvider>
    )
  )
  await vi.waitFor(() => expect(tree).toHaveBeenCalled())
  const props = () => tree.mock.lastCall![0]
  const menu = () =>
    host.querySelector<HTMLElement>(".space-root-context-menu")!
  const click = async (label: string, scope: ParentNode = menu()) => {
    const button = [
      ...scope.querySelectorAll<HTMLButtonElement>("button"),
    ].find((button) =>
      button.textContent?.replace(/\s+/g, " ").trim().startsWith(label)
    )!
    expect(button, label).toBeTruthy()
    await act(async () => {
      button.click()
      await drain()
    })
  }
  const heading = () => host.querySelector<HTMLElement>(".space-heading")!
  const open = async (entry: "heading" | "blank", x = 30, y = 40) => {
    await act(async () => {
      if (entry === "heading") {
        ;(
          heading().querySelector<HTMLElement>(
            ".space-switcher-trigger, nav button"
          ) ?? heading()
        ).dispatchEvent(
          new MouseEvent("contextmenu", {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
          })
        )
      } else {
        host.querySelector<HTMLElement>("[data-test-tree]")!.focus()
        props().onRootContextMenu!(x, y)
      }
    })
    expect(host.querySelectorAll(".space-root-context-menu")).toHaveLength(1)
    expect(host.querySelector(".workspace-heading-menu-content")).toBeNull()
    expect(document.querySelector(".space-switcher-menu")).toBeNull()
    return menu()
  }
  const close = async () =>
    act(async () =>
      document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }))
    )
  const sequence = () =>
    [
      ...menu().querySelectorAll<HTMLElement>(
        '[role="menuitem"], [role="separator"]'
      ),
    ].map((node) =>
      node.getAttribute("role") === "separator"
        ? "|"
        : node.textContent!.replace(/\s+/g, " ").trim()
    )
  const record = async (
    name: string,
    details: Record<string, unknown> = {}
  ) => {
    const output = process.env.EIDOS_LITE_EXPLORER_MENU_TEST_EVIDENCE
    if (!output) return
    if (!path.isAbsolute(output))
      throw new Error("Evidence directory must be absolute")
    await fs.mkdir(output, { recursive: true })
    await fs.writeFile(
      path.join(output, `space-${name}.json`),
      JSON.stringify(
        {
          language,
          platform,
          terminal,
          readOnly,
          layout,
          sequence: menu() ? sequence() : null,
          html: menu()?.outerHTML,
          ...details,
        },
        null,
        2
      ) + "\n"
    )
  }
  return {
    host,
    session,
    spaceRoot,
    directory,
    methods,
    props,
    menu,
    heading,
    open,
    close,
    click,
    sequence,
    record,
    navigate: async () => {
      const entry = initial.entries.find(
        (entry) => entry.relativePath === "visible"
      )!
      await act(async () => props().onContextMenu(entry, 10, 20, [entry]))
      await click("Show this folder", host.querySelector('[role="menu"]')!)
      await vi.waitFor(() => expect(props().rootDirectory).toBe("visible"))
    },
    create: async (label: string, name: string, plus = false) => {
      if (plus) {
        await act(async () =>
          heading()
            .querySelector<HTMLButtonElement>('[aria-label="Create"]')!
            .click()
        )
        await click(label, heading().querySelector('[role="group"]')!)
      } else await click(label)
      if (label === "New File")
        await act(async () =>
          host
            .querySelector<HTMLButtonElement>(
              '[role="radio"][aria-label="Text (.md)"]'
            )!
            .click()
        )
      const input = host.querySelector<HTMLInputElement>(".path-dialog input")!
      await act(async () => {
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value"
        )!.set!.call(input, name)
        input.dispatchEvent(new Event("input", { bubbles: true }))
      })
      await act(async () => {
        host
          .querySelector(".path-dialog")!
          .dispatchEvent(
            new Event("submit", { bubbles: true, cancelable: true })
          )
        await drain()
      })
      await vi.waitFor(() =>
        expect(host.querySelector(".path-dialog")).toBeNull()
      )
    },
    cleanup: async () => {
      await act(async () => root.unmount())
      host.remove()
      textDraftLifecycle.release()
      await session.close()
      await fs.rm(directory, { recursive: true, force: true })
      if (previousApi) Object.defineProperty(window, "eidosLite", previousApi)
      else Reflect.deleteProperty(window, "eidosLite")
      window.localStorage.clear()
      window.sessionStorage.clear()
    },
  }
}

it.each([
  { entry: "heading", mode: "copy" },
  { entry: "heading", mode: "cut" },
  { entry: "blank", mode: "copy" },
  { entry: "blank", mode: "cut" },
] as const)(
  "keeps $entry root creation/import/$mode paste separate from a deep folder and plus actions",
  async ({ entry, mode }) => {
    const f = await setup()
    try {
      await f.navigate()
      const deep = f
        .props()
        .entries.find((entry) => entry.relativePath === "visible/deep")!
      await act(async () => f.props().onContextMenu(deep, 10, 20, [deep]))
      await f.click(
        mode === "copy" ? "Copy" : "Cut",
        f.host.querySelector('[role="menu"]')!
      )
      if (entry === "heading" && mode === "cut") {
        await act(async () =>
          f
            .heading()
            .querySelector<HTMLButtonElement>(
              '[aria-label="Filter tree by name"]'
            )!
            .click()
        )
        const input = f.heading().querySelector("input")!
        await act(async () => {
          Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value"
          )!.set!.call(input, "source")
          input.dispatchEvent(new Event("input", { bubbles: true }))
        })
        expect(f.props().nameQuery).toBe("source")
      }
      await f.open(entry)
      await f.record(`${entry}-${mode}-deep-before`)
      await f.create("New folder", `root-${entry}`)
      expect(f.methods.createFolder).toHaveBeenLastCalledWith(
        null,
        `root-${entry}`
      )
      expect(
        (await fs.stat(path.join(f.spaceRoot, `root-${entry}`))).isDirectory()
      ).toBe(true)
      await f.open(entry)
      await f.create("New File", `${entry}.md`)
      expect(f.methods.createTextFile).toHaveBeenLastCalledWith(
        null,
        `${entry}.md`
      )
      expect(
        await fs.readFile(path.join(f.spaceRoot, `${entry}.md`), "utf8")
      ).toBe("")
      await f.open(entry)
      await f.click("Import files")
      await vi.waitFor(() =>
        expect(f.methods.importFiles).toHaveBeenLastCalledWith(null)
      )
      await vi.waitFor(async () =>
        expect(
          await fs.readFile(path.join(f.spaceRoot, "imported.txt"), "utf8")
        ).toBe("import source")
      )
      await f.open(entry)
      await f.click("Paste")
      await vi.waitFor(async () =>
        expect(
          await fs.readFile(path.join(f.spaceRoot, "deep/source.txt"), "utf8")
        ).toBe("clipboard source")
      )
      if (mode === "copy") {
        expect(f.methods.copyPath).toHaveBeenLastCalledWith(
          "visible/deep",
          null,
          expect.any(Object)
        )
        expect(
          await fs.readFile(
            path.join(f.spaceRoot, "visible/deep/source.txt"),
            "utf8"
          )
        ).toBe("clipboard source")
      } else {
        expect(f.methods.movePaths).toHaveBeenLastCalledWith(
          ["visible/deep"],
          null,
          expect.any(Object)
        )
        expect(
          await fs.stat(path.join(f.spaceRoot, "visible/deep")).then(
            () => true,
            () => false
          )
        ).toBe(false)
      }
      expect(
        await fs.stat(path.join(f.spaceRoot, "visible", `root-${entry}`)).then(
          () => true,
          () => false
        )
      ).toBe(false)
      const closeSearch = f
        .heading()
        .querySelector<HTMLButtonElement>('[aria-label="Close search"]')
      if (closeSearch) await act(async () => closeSearch.click())
      await f.create("New folder", "plus-folder", true)
      expect(f.methods.createFolder).toHaveBeenLastCalledWith(
        "visible",
        "plus-folder"
      )
      expect(
        (
          await fs.stat(path.join(f.spaceRoot, "visible/plus-folder"))
        ).isDirectory()
      ).toBe(true)
      await act(async () =>
        f
          .heading()
          .querySelector<HTMLButtonElement>('[aria-label="Create"]')!
          .click()
      )
      await f.click(
        "Import files",
        f.heading().querySelector('[role="group"]')!
      )
      await vi.waitFor(async () =>
        expect(
          await fs.readFile(
            path.join(f.spaceRoot, "visible/imported.txt"),
            "utf8"
          )
        ).toBe("import source")
      )
      expect(f.methods.importFiles).toHaveBeenLastCalledWith("visible")
      await f.open(entry)
      await f.click("Reveal in Finder")
      expect(f.methods.revealPath).toHaveBeenLastCalledWith(".")
      await f.open(entry)
      await f.click("Manage files")
      await vi.waitFor(() =>
        expect(f.methods.openFileMetadata).toHaveBeenCalledWith(null)
      )
      expect(
        f.host.querySelector('[role="alert"]')?.textContent
      ).toBeUndefined()
      expect(f.host.querySelector("[data-test-metadata-scope]")).not.toBeNull()
      await f.record(`${entry}-${mode}-filesystem`, {
        createFolderCalls: f.methods.createFolder.mock.calls,
        createFileCalls: f.methods.createTextFile.mock.calls,
        importCalls: f.methods.importFiles.mock.calls,
        copyCalls: f.methods.copyPath.mock.calls.map(([source, target]) => ({
          source,
          target,
        })),
        moveCalls: f.methods.movePaths.mock.calls.map(([sources, target]) => ({
          sources,
          target,
        })),
        rootFiles: await fs.readdir(f.spaceRoot),
        nestedFiles: await fs.readdir(path.join(f.spaceRoot, "visible")),
        results: {
          rootPaste: await fs.readFile(
            path.join(f.spaceRoot, "deep/source.txt"),
            "utf8"
          ),
          originalSourcePresent: await fs
            .stat(path.join(f.spaceRoot, "visible/deep/source.txt"))
            .then(
              () => true,
              () => false
            ),
          rootImport: await fs.readFile(
            path.join(f.spaceRoot, "imported.txt"),
            "utf8"
          ),
          directoryImport: await fs.readFile(
            path.join(f.spaceRoot, "visible/imported.txt"),
            "utf8"
          ),
        },
      })
    } finally {
      await f.cleanup()
    }
  }
)

it.each([
  { readOnly: false, language: "en", platform: "darwin", terminal: true },
  { readOnly: true, language: "en", platform: "win32", terminal: true },
  { readOnly: false, language: "zh", platform: "linux", terminal: false },
  {
    readOnly: false,
    language: "en",
    platform: "win32",
    terminal: false,
    folders: false,
  },
  {
    readOnly: false,
    language: "en",
    platform: "darwin",
    terminal: false,
    layout: "modified",
  },
])(
  "uses identical root contents and state through both entries: %j",
  async (options) => {
    const f = await setup(options)
    try {
      await f.open("blank")
      const snapshot = () => ({
        sequence: f.sequence(),
        buttons: [
          ...f.menu().querySelectorAll<HTMLButtonElement>("button"),
        ].map((button) => ({
          text: button.textContent,
          disabled: button.disabled,
        })),
        className: f.menu().className,
        style: f.menu().getAttribute("style"),
      })
      const blank = snapshot()
      await f.record(
        `blank-${options.platform}-${options.language}-${options.readOnly}-${options.layout ?? "tree"}-${options.folders ?? true}`
      )
      await f.close()
      await f.open("heading")
      expect(snapshot()).toEqual(blank)
      await f.record(
        `heading-${options.platform}-${options.language}-${options.readOnly}-${options.layout ?? "tree"}-${options.folders ?? true}`
      )
      if (options.language === "en") {
        expect(f.sequence().slice(0, 4)).toEqual([
          "New File",
          "New folder",
          "Import files",
          "|",
        ])
        expect(f.sequence().includes("Expand all folders")).toBe(
          options.folders !== false && options.layout !== "modified"
        )
        const buttons = [
          ...f.menu().querySelectorAll<HTMLButtonElement>("button"),
        ]
        expect(buttons.slice(0, 4).map((button) => button.disabled)).toEqual([
          options.readOnly,
          options.readOnly,
          options.readOnly,
          true,
        ])
        expect(buttons.at(-1)!.disabled).toBe(false)
        if (options.readOnly) {
          for (const label of [
            "New File",
            "New folder",
            "Import files",
            "Paste",
          ])
            await f.click(label)
          expect(f.methods.createFolder).not.toHaveBeenCalled()
          expect(f.methods.createTextFile).not.toHaveBeenCalled()
          expect(f.methods.importFiles).not.toHaveBeenCalled()
          expect(f.methods.copyPath).not.toHaveBeenCalled()
          // Only this synthetic read-only Space is probed; the real Desktop is never opened.
          await expect(f.session.createFolder(null, "blocked")).rejects.toThrow(
            "read-only"
          )
          expect(
            await fs.stat(path.join(f.spaceRoot, "blocked")).then(
              () => true,
              () => false
            )
          ).toBe(false)
        }
      }
      if (options.terminal) {
        await f.click("Show terminal")
        await f.open("heading")
        expect(f.sequence()).toContain("Hide terminal")
        await f.record(`terminal-open-${options.platform}-${options.readOnly}`)
        await f.click("Hide terminal")
      }
    } finally {
      await f.cleanup()
    }
  }
)

it("handles keyboard invocation, expansion, Escape/outside dismissal, and preserves switcher/breadcrumb/input actions", async () => {
  const f = await setup()
  try {
    const switcher = f.host.querySelector<HTMLButtonElement>(
      ".space-switcher-trigger"
    )!
    await act(async () => switcher.click())
    expect(document.querySelector(".space-switcher-menu")).not.toBeNull()
    await act(async () => switcher.focus())
    await act(async () =>
      switcher.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "F10",
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        })
      )
    )
    expect(document.querySelector(".space-switcher-menu")).toBeNull()
    expect(f.menu()).not.toBeNull()
    expect(document.activeElement?.textContent).toContain("New File")
    await act(async () =>
      document.activeElement!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "End", bubbles: true })
      )
    )
    expect(document.activeElement?.textContent).toContain("Reveal in Finder")
    await act(async () =>
      document.activeElement!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      )
    )
    expect(f.menu()).toBeNull()
    expect(document.activeElement).toBe(switcher)
    await f.open("heading")
    await f.click("Expand all folders")
    expect(expansion.toggle).toHaveBeenCalledOnce()
    await f.open("blank")
    expect(f.sequence()).toContain("Collapse all folders")
    await f.close()
    expect(f.menu()).toBeNull()
    await f.navigate()
    await f.open("heading")
    await f.close()
    await act(async () =>
      f.heading().querySelector<HTMLButtonElement>("nav button")!.click()
    )
    await vi.waitFor(() => expect(f.props().rootDirectory).toBeNull())
    await act(async () =>
      f
        .heading()
        .querySelector<HTMLButtonElement>('[aria-label="Filter tree by name"]')!
        .click()
    )
    const input = f.heading().querySelector("input")!
    const context = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    })
    const paste = new KeyboardEvent("keydown", {
      key: "v",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    })
    await act(async () => {
      input.dispatchEvent(context)
      input.dispatchEvent(paste)
    })
    expect(context.defaultPrevented).toBe(false)
    expect(paste.defaultPrevented).toBe(false)
    expect(f.menu()).toBeNull()
  } finally {
    await f.cleanup()
  }
})

it.each([
  [300, 240],
  [1440, 1000],
])(
  "clamps either root popup to an owned %sx%s viewport and restores the right trigger",
  async (width, height) => {
    const f = await setup()
    try {
      vi.stubGlobal("innerWidth", width)
      vi.stubGlobal("innerHeight", height)
      const original = HTMLElement.prototype.getBoundingClientRect
      vi.spyOn(
        HTMLElement.prototype,
        "getBoundingClientRect"
      ).mockImplementation(function (this: HTMLElement) {
        if (this.classList.contains("space-root-context-menu"))
          return {
            width: 220,
            height: 200,
            top: height - 4,
            left: width - 4,
            bottom: height + 196,
            right: width + 216,
            x: width - 4,
            y: height - 4,
            toJSON() {},
          }
        return original.call(this)
      })
      for (const entry of ["blank", "heading"] as const) {
        await f.open(entry, width - 4, height - 4)
        expect(f.menu().style.left).toBe(`${width - 228}px`)
        expect(f.menu().style.top).toBe(`${height - 208}px`)
        await f.record(`bounds-${width}-${entry}`, {
          width,
          height,
          left: f.menu().style.left,
          top: f.menu().style.top,
          bounds: "synthetic DOM geometry",
        })
        await act(async () =>
          document.activeElement!.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
          )
        )
        expect(document.activeElement).toBe(
          entry === "blank"
            ? f.host.querySelector("[data-test-tree]")
            : f.host.querySelector(".space-switcher-trigger")
        )
      }
    } finally {
      await f.cleanup()
    }
  }
)
