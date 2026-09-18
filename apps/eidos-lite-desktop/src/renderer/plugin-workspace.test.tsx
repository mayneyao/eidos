// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, expect, it, vi } from "vitest"
import {
  PluginWorkspace,
  PluginPage,
  PluginCommandPalette,
} from "./plugin-workspace"
import type { PluginOpenResult } from "../shared/plugins"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

it("navigates commands visibly, wraps, scrolls and executes from the search input", async () => {
  HTMLDialogElement.prototype.showModal = vi.fn()
  HTMLDialogElement.prototype.close = vi.fn()
  const scroll = vi.fn()
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: scroll,
  })
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  const onInvoke = vi.fn(),
    onClose = vi.fn()
  const actions = Array.from({ length: 30 }, (_, index) => ({
    key: String(index),
    title: `Command ${index}`,
  }))
  const render = (entries = actions) => (
    <PluginCommandPalette
      actions={entries}
      onClose={onClose}
      onInvoke={onInvoke}
    />
  )
  await act(async () => root.render(render()))
  const input = container.querySelector("input")!
  const press = async (key: string, isComposing = false) =>
    act(async () => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          key,
          isComposing,
          bubbles: true,
          cancelable: true,
        })
      )
    })
  const selected = () => container.querySelector('[data-selected="true"]')
  expect(document.activeElement).toBe(input)
  expect(selected()?.querySelector(".quick-open-item-name")?.textContent).toBe(
    "Command 0"
  )
  await press("ArrowUp")
  expect(selected()?.querySelector(".quick-open-item-name")?.textContent).toBe(
    "Command 29"
  )
  expect(input.getAttribute("aria-activedescendant")).toBe(selected()?.id)
  expect(scroll).toHaveBeenLastCalledWith({ block: "nearest" })
  await press("ArrowDown")
  expect(selected()?.querySelector(".quick-open-item-name")?.textContent).toBe(
    "Command 0"
  )
  await press("ArrowDown")
  await press("Enter", true)
  expect(onInvoke).not.toHaveBeenCalled()
  await press("Enter")
  expect(onInvoke).toHaveBeenLastCalledWith("1")
  // A context change shrinks the list while the panel remains open.
  await press("ArrowUp")
  await press("ArrowUp")
  await act(async () => root.render(render(actions.slice(0, 2))))
  await press("ArrowDown")
  expect(selected()?.querySelector(".quick-open-item-name")?.textContent).toBe(
    "Command 0"
  )
  await act(async () => root.render(render([])))
  onInvoke.mockClear()
  await press("ArrowDown")
  await press("Enter")
  expect(onInvoke).not.toHaveBeenCalled()
  expect(input.hasAttribute("aria-activedescendant")).toBe(false)
  await press("Escape")
  expect(onClose).toHaveBeenCalledOnce()
  await act(async () => root.unmount())
  expect(HTMLDialogElement.prototype.close).toHaveBeenCalled()
  Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView")
})
afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})
it("selects among formatters, persists a Space default, and invokes it through the host command", async () => {
  HTMLDialogElement.prototype.showModal = vi.fn()
  HTMLDialogElement.prototype.close = vi.fn()
  let command!: (key: string) => void
  const listing = {
    space: {
      plugins: {},
      associations: {},
      formatters: {} as Record<string, string>,
    },
    plugins: ["first", "second"].map((id) => ({
      enabled: true,
      hash: id,
      manifest: {
        apiVersion: 1,
        id: `example.${id}`,
        name: id,
        version: "1.0.0",
        formatters: [{ id: "format", title: id, extensions: [".md"] }],
      },
    })),
  }
  const format = vi.fn<
    () => Promise<{
      changed: boolean
      draft?: { text: string; expectedRevision: string }
    }>
  >(async () => ({ changed: false }))
  const onDraft = vi.fn()
  const onActionComplete = vi.fn()
  const setDefault = vi.fn(async (extension: string, key: string) => {
    listing.space.formatters[extension] = key
  })
  Object.assign(window, {
    eidosLite: {
      listPlugins: async () => listing,
      onWorkspaceShortcutCommand: (listener: typeof command) => {
        command = listener
        return () => {}
      },
      onPluginEvent: () => () => {},
      setPluginShortcuts: async (bindings: string[]) => bindings,
      openPluginExtension: async (id: string) => ({ instance: instance(id) }),
      invokePluginFormatter: format,
      setDefaultFormatter: setDefault,
      closePluginEditor: async () => {},
    },
  })
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  await act(async () =>
    root.render(
      <PluginWorkspace
        onPage={() => {}}
        onDraft={onDraft}
        onActionComplete={onActionComplete}
        document={{ path: "notes.md" }}
      />
    )
  )
  await act(async () => command("format-document"))
  expect(container.querySelector("dialog")?.getAttribute("aria-label")).toBe(
    "Format Document With…"
  )
  const click = async (text: string) =>
    act(async () =>
      Array.from(
        container.querySelectorAll<HTMLButtonElement>('[role="option"]')
      )
        .find((button) => button.textContent?.includes(text))!
        .click()
    )
  await click("second")
  expect(format).toHaveBeenLastCalledWith(
    "example.second",
    "format",
    "notes.md",
    undefined,
    expect.any(String)
  )
  await act(async () => command("command-palette"))
  await click("Configure Default Formatter")
  await click("first")
  expect(setDefault).toHaveBeenCalledWith(".md", "example.first/format")
  await act(async () => command("format-document"))
  expect(container.querySelector("dialog")).toBeNull()
  expect(format).toHaveBeenLastCalledWith(
    "example.first",
    "format",
    "notes.md",
    undefined,
    expect.any(String)
  )
  expect(document.body.textContent).not.toContain(
    "No formatting changes needed."
  )
  expect(onDraft).not.toHaveBeenCalled()
  format.mockResolvedValueOnce({
    changed: true,
    draft: { text: "formatted", expectedRevision: "revision" },
  })
  await act(async () => command("format-document"))
  expect(onDraft).toHaveBeenCalledWith("notes.md", {
    text: "formatted",
    expectedRevision: "revision",
  })
  expect(onActionComplete).not.toHaveBeenCalled()
  await act(async () => root.unmount())
})
const instance = (ticket: string) => ({
  ticket,
  url: `eidos-plugin://${ticket}/index.html`,
  editor: { key: "example.tools/home", label: ticket, pluginName: "Tools" },
})

it("captures the document before asynchronous activation and routes its result to that draft", async () => {
  HTMLDialogElement.prototype.showModal = vi.fn()
  HTMLDialogElement.prototype.close = vi.fn()
  let activate!: (result: PluginOpenResult) => void
  const ready = new Promise<PluginOpenResult>((resolve) => {
    activate = resolve
  })
  const draft = { text: "edited A", expectedRevision: "a1" }
  const invoke = vi.fn(async () => ({ draft }))
  const onDraft = vi.fn()
  const onActionComplete = vi.fn()
  const close = vi.fn(async () => {})
  const registerShortcuts = vi.fn(async (bindings: string[]) => bindings)
  let openPalette!: (command: "command-palette") => void
  let shortcut!: (binding: string) => void
  Object.assign(window, {
    eidosLite: {
      setPluginShortcuts: registerShortcuts,
      onPluginShortcut: (listener: typeof shortcut) => {
        shortcut = listener
        return () => {}
      },
      onWorkspaceShortcutCommand: (listener: typeof openPalette) => {
        openPalette = listener
        return () => {}
      },
      listPlugins: async () => ({
        space: { plugins: {}, associations: {} },
        plugins: [
          {
            enabled: true,
            manifest: {
              id: "example.tools",
              name: "Tools",
              actions: [
                {
                  id: "trim",
                  title: "Trim",
                  context: "document",
                  extensions: [".md"],
                },
              ],
              placements: [
                { location: "command-palette", action: "trim" },
                { location: "keybinding", action: "trim", key: "Mod+Alt+F" },
              ],
            },
          },
        ],
      }),
      openPluginExtension: () => ready,
      invokePluginAction: invoke,
      closePluginEditor: close,
      onPluginEvent: () => () => {},
    },
  })
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  const render = (path: string, navigationVisible = true, disabled = false) => (
    <PluginWorkspace
      onPage={() => {}}
      document={{ path }}
      onDraft={onDraft}
      onActionComplete={onActionComplete}
      navigationVisible={navigationVisible}
      disabled={disabled}
    />
  )
  await act(async () => root.render(render("a.md", false)))
  expect(container.querySelector("nav")).toBeNull()
  await act(async () => openPalette("command-palette"))
  expect(container.querySelector("dialog")).not.toBeNull()
  expect(container.querySelector("kbd")?.textContent).toContain("F")
  await act(async () =>
    Array.from(container.querySelectorAll<HTMLButtonElement>('[role="option"]'))
      .find((button) => button.textContent?.includes("Trim"))!
      .click()
  )
  await act(async () => root.render(render("b.md")))
  await act(async () => activate({ instance: instance("extension") }))
  expect(invoke).toHaveBeenCalledWith("extension", "trim", "a.md", undefined)
  expect(onDraft).toHaveBeenCalledWith("a.md", draft)
  expect(onActionComplete).toHaveBeenCalledWith("a.md")
  await act(async () => shortcut("Mod+Alt+F"))
  expect(invoke).toHaveBeenLastCalledWith(
    "extension",
    "trim",
    "b.md",
    undefined
  )
  onDraft.mockClear()
  Object.assign(window.eidosLite, {
    pluginRequest: async () => ({
      response: {
        protocol: "eidos-plugin",
        apiVersion: 1,
        id: "late",
        result: null,
      },
      draft,
      draftPath: "a.md",
      notification: "Trailing whitespace removed and saved.",
    }),
  })
  await act(async () =>
    window.dispatchEvent(
      new MessageEvent("message", {
        source: container.querySelector("iframe")!.contentWindow,
        data: {
          protocol: "eidos-plugin",
          apiVersion: 1,
          id: "late",
          method: "document.read",
          params: { invocation: "previous", args: null },
        },
      })
    )
  )
  expect(onDraft).toHaveBeenCalledExactlyOnceWith("a.md", draft)
  const notice = document.body.querySelector(".plugin-command-notice")!
  expect(notice.textContent).toContain("Trailing whitespace removed and saved.")
  expect(container.contains(notice)).toBe(false)
  await act(async () =>
    notice.querySelector<HTMLButtonElement>("button")!.click()
  )
  expect(document.body.querySelector(".plugin-command-notice")).toBeNull()
  const count = invoke.mock.calls.length
  await act(async () => root.render(render("b.md", true, true)))
  expect(registerShortcuts).toHaveBeenLastCalledWith([])
  await act(async () => shortcut("Mod+Alt+F"))
  expect(invoke).toHaveBeenCalledTimes(count)
  await act(async () => root.render(render("unsupported.csv")))
  expect(registerShortcuts).toHaveBeenLastCalledWith([])
  await act(async () => shortcut("Mod+Alt+F"))
  expect(invoke).toHaveBeenCalledTimes(count)
  await act(async () => root.unmount())
  expect(registerShortcuts).toHaveBeenLastCalledWith([])
  expect(close).toHaveBeenCalledWith("extension")
})

it("discards a late page open and closes its unused capability", async () => {
  const pending = new Map<string, (result: PluginOpenResult) => void>()
  const close = vi.fn(async () => {})
  Object.assign(window, {
    eidosLite: {
      openPluginPage: (key: string) =>
        new Promise<PluginOpenResult>((resolve) => pending.set(key, resolve)),
      closePluginEditor: close,
      onPluginEvent: () => () => {},
    },
  })
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  const render = (key: string) => (
    <PluginPage pageKey={key} onClose={() => {}} onNavigate={() => {}} />
  )
  await act(async () => root.render(render("example.tools/a")))
  await act(async () => root.render(render("example.tools/b")))
  await act(async () =>
    pending.get("example.tools/b")!({ instance: instance("new") })
  )
  await act(async () =>
    pending.get("example.tools/a")!({ instance: instance("old") })
  )
  expect(container.querySelector("iframe")?.title).toBe("new")
  expect(close).toHaveBeenCalledWith("old")
  await act(async () => root.unmount())
})

it("updates open palette commands with the visible file and excludes disabled plugins", async () => {
  HTMLDialogElement.prototype.showModal = vi.fn()
  HTMLDialogElement.prototype.close = vi.fn()
  let shortcut!: (command: string) => void
  const workspace = {
    id: "workspace",
    title: "Workspace action",
    context: "workspace",
  }
  const markdown = {
    id: "markdown",
    title: "Markdown action",
    context: "document",
    extensions: [".md"],
  }
  const csv = {
    id: "csv",
    title: "CSV action",
    context: "document",
    extensions: [".csv"],
  }
  const manifest = {
    id: "example.tools",
    name: "Text Tools",
    actions: [workspace, markdown, csv],
    placements: [workspace, markdown, csv].map((a) => ({
      location: "command-palette",
      action: a.id,
    })),
  }
  Object.assign(window, {
    eidosLite: {
      listPlugins: async () => ({
        plugins: [
          { enabled: true, manifest },
          { enabled: false, manifest: { ...manifest, id: "disabled.tools" } },
        ],
      }),
      onWorkspaceShortcutCommand: (listener: typeof shortcut) => {
        shortcut = listener
        return () => {}
      },
      onPluginEvent: () => () => {},
    },
  })
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  const run = vi.fn()
  const render = (path?: string) => (
    <PluginWorkspace
      onPage={() => {}}
      onDraft={() => {}}
      document={path ? { path } : undefined}
      commands={[{ key: "host/test", title: "Built-in", run }]}
    />
  )
  const titles = () =>
    Array.from(
      container.querySelectorAll('[role="option"]'),
      (node) => node.querySelector(".quick-open-item-name")?.textContent
    )
  await act(async () => root.render(render("notes.MD")))
  await act(async () => shortcut("command-palette"))
  const formatCommands = [
    "Format Document",
    "Format Document With…",
    "Configure Default Formatter…",
  ]
  expect(titles()).toEqual([
    "Built-in",
    ...formatCommands,
    "Workspace action",
    "Markdown action",
  ])
  expect(
    Array.from(
      container.querySelectorAll(".quick-open-group-label"),
      (node) => node.textContent
    )
  ).toEqual(["Built-in", "Text Tools"])
  const input = container.querySelector("input")!
  const search = async (query: string) =>
    act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )!.set!.call(input, query)
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })
  await search("text tools")
  expect(titles()).toEqual(["Workspace action", "Markdown action"])
  await search("example.tools")
  expect(titles()).toEqual(["Workspace action", "Markdown action"])
  await search("")
  await act(async () => root.render(render("data.csv")))
  expect(titles()).toEqual([
    "Built-in",
    ...formatCommands,
    "Workspace action",
    "CSV action",
  ])
  await act(async () => root.render(render()))
  expect(titles()).toEqual(["Built-in", "Workspace action"])
  await act(async () =>
    container.querySelector<HTMLButtonElement>('[role="option"]')!.click()
  )
  expect(run).toHaveBeenCalledOnce()
  expect(container.querySelector("dialog")).toBeNull()
  await act(async () => root.unmount())
})
