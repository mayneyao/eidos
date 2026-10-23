// @vitest-environment jsdom
import { act, type ComponentProps } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import type { EidosFileSnapshot } from "@eidos.space/eidos-file"
import type { EidosLiteApi, TextFilePreviewResult } from "../shared/contracts"
import type { PluginOpenResult } from "../shared/plugins"
import { DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS } from "../shared/keyboard-shortcuts"
import { textDraftLifecycle } from "./text-draft-lifecycle"

const textSurface = vi.hoisted(() =>
  vi.fn<
    (props: {
      preview: TextFilePreviewResult
      draft?: { content: string }
      onReload(preview: TextFilePreviewResult): void
      onSaved(preview: Extract<TextFilePreviewResult, { type: "text" }>): void
    }) => void
  >()
)

vi.mock("./plugin-editor", () => ({
  PluginEditor: ({ instance }: { instance: { ticket: string } }) => (
    <div data-plugin-ticket={instance.ticket} />
  ),
}))
vi.mock("./text-file-preview", () => ({
  prepareTextFilePreview: vi.fn(async () => undefined),
  TextFilePreview: (props: Parameters<typeof textSurface>[0]) => {
    textSurface(props)
    return (
      <div data-text-path={props.preview.relativePath}>
        {props.draft?.content}
      </div>
    )
  },
}))
vi.mock("./eidos-file-workbench", () => ({
  EidosFileWorkbench: ({ relativePath }: { relativePath: string }) => (
    <div data-eidos-path={relativePath} />
  ),
}))
import { FileSidebar } from "./file-sidebar"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const image = (relativePath: string): TextFilePreviewResult => ({
  type: "media",
  relativePath,
  mediaKind: "image",
  mimeType: "image/png",
  previewUrl: `eidos-space://test/${relativePath}`,
  size: 12,
  modifiedAtMs: 1,
})
const plugin = (ticket: string): PluginOpenResult => ({
  instance: {
    ticket,
    url: `eidos-plugin://${ticket}/index.html`,
    editor: { key: "review/file", label: "Review", pluginName: "Review" },
  },
})
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => (resolve = done))
  return { promise, resolve }
}
let container: HTMLDivElement
let root: ReturnType<typeof createRoot>
let props: ComponentProps<typeof FileSidebar>
let preview: ReturnType<
  typeof vi.fn<(path: string) => Promise<TextFilePreviewResult>>
>
let openPlugin: ReturnType<
  typeof vi.fn<
    (
      path: string,
      explicit?: string,
      draft?: unknown
    ) => Promise<PluginOpenResult>
  >
>
let closePlugin: ReturnType<typeof vi.fn>

beforeEach(() => {
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  preview = vi.fn(async (path) => image(path))
  openPlugin = vi.fn(async () => ({ instance: null }))
  closePlugin = vi.fn(async () => undefined)
  textSurface.mockClear()
  window.eidosLite = {
    previewTextFile: preview,
    openPluginEditor: openPlugin,
    closePluginEditor: closePlugin,
  } as unknown as EidosLiteApi
  props = {
    relativePath: "a.png",
    disabled: false,
    theme: "light",
    platform: "darwin",
    drafts: {},
    markdownFileEditingMode: "wysiwyg",
    markdownCompatibilityProfile: "obsidian",
    htmlFileOpenMode: "preview",
    keyboardShortcuts: DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS,
    onDraftChange: vi.fn(),
    onOpenFile: vi.fn(),
    onNavigatePlugin: vi.fn(),
    onReleaseEidosFile: vi.fn(async () => undefined),
    onChanged: vi.fn(),
    onClose: vi.fn(),
  }
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  textDraftLifecycle.update("review.md", null)
})
const render = async (changes: Partial<typeof props> = {}) => {
  props = { ...props, ...changes }
  await act(async () => root.render(<FileSidebar {...props} />))
}

it("keeps media metadata beside the title and opens its file context menu", async () => {
  const onTitleContextMenu = vi.fn()
  await render({ onTitleContextMenu })
  const title = container.querySelector<HTMLButtonElement>(
    ".file-sidebar-title"
  )!
  expect(title.textContent).toContain("a.png")
  expect(title.textContent).toContain("Image")
  expect(title.textContent).toContain("12 B")
  expect(container.querySelector(".media-file-preview header")).toBeNull()
  await act(async () =>
    title.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 120,
        clientY: 20,
      })
    )
  )
  expect(onTitleContextMenu).toHaveBeenLastCalledWith("a.png", 120, 20)
  await render({ relativePath: "b.png" })
  const nextTitle = container.querySelector<HTMLButtonElement>(
    ".file-sidebar-title"
  )!
  await act(async () =>
    nextTitle.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "F10",
        shiftKey: true,
      })
    )
  )
  expect(onTitleContextMenu).toHaveBeenLastCalledWith("b.png", 0, 0)
})

it("uses the configured File View and supplies the existing draft", async () => {
  textDraftLifecycle.update("review.md", { content: "unsaved", revision: "v1" })
  openPlugin.mockResolvedValue(plugin("configured"))
  await render({ relativePath: "review.md" })
  expect(openPlugin).toHaveBeenCalledExactlyOnceWith("review.md", undefined, {
    text: "unsaved",
    expectedRevision: "v1",
  })
  expect(
    container
      .querySelector("[data-plugin-ticket]")
      ?.getAttribute("data-plugin-ticket")
  ).toBe("configured")
  expect(container.querySelector("[data-text-path]")).toBeNull()
  await render({
    drafts: { "review.md": { content: "new draft", revision: "v1" } },
  })
  expect(openPlugin).toHaveBeenCalledTimes(1)
})

it("renders the ordinary media preview when no custom opening method applies", async () => {
  await render()
  expect(container.querySelector("img")?.getAttribute("src")).toBe(
    "eidos-space://test/a.png"
  )
  expect(container.querySelector("img")?.alt).toBe("a.png")
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('[aria-label="Close file preview"]')!
      .click()
  )
  expect(props.onClose).toHaveBeenCalledOnce()
})

it("keeps ready content while switching and disposes a superseded File View", async () => {
  await render()
  const pending = deferred<PluginOpenResult>()
  openPlugin.mockImplementation((path) =>
    path === "b.png" ? pending.promise : Promise.resolve({ instance: null })
  )
  await render({ relativePath: "b.png" })
  expect(container.querySelector("header strong")?.textContent).toBe("a.png")
  expect(container.querySelector("img")?.alt).toBe("a.png")
  expect(
    container.querySelector<HTMLDivElement>(".file-sidebar-body")?.inert
  ).toBe(true)
  await render({ relativePath: "c.png" })
  await act(async () => pending.resolve(plugin("stale")))
  expect(closePlugin).toHaveBeenCalledExactlyOnceWith("stale")
  expect(container.querySelector("header strong")?.textContent).toBe("c.png")
  expect(container.querySelector("img")?.alt).toBe("c.png")
  expect(container.querySelector("[data-plugin-ticket]")).toBeNull()
})

it("retains the previous file on failure and can retry the requested file", async () => {
  await render()
  preview.mockRejectedValueOnce(new Error("unavailable"))
  await render({ relativePath: "b.png" })
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "b.png: unavailable"
  )
  expect(container.querySelector("img")?.alt).toBe("a.png")
  await act(async () =>
    container.querySelector<HTMLButtonElement>('[role="alert"] button')!.click()
  )
  expect(container.querySelector("img")?.alt).toBe("b.png")
})

it("does not replace the new file when an earlier editor finishes a save or reload", async () => {
  const old: Extract<TextFilePreviewResult, { type: "text" }> = {
    type: "text",
    relativePath: "old.txt",
    content: "old",
    encoding: "utf-8",
    bom: false,
    revision: "v1",
    size: 3,
    modifiedAtMs: 1,
    truncated: false,
  }
  preview.mockResolvedValueOnce(old)
  await render({ relativePath: "old.txt" })
  const callbacks = textSurface.mock.calls.at(-1)![0]
  await render({ relativePath: "new.png" })
  await act(async () => {
    callbacks.onReload(old)
    callbacks.onSaved({ ...old, relativePath: "renamed.txt" })
  })
  expect(container.querySelector("img")?.alt).toBe("new.png")
  expect(container.querySelector("header strong")?.textContent).toBe("new.png")
  expect(props.onOpenFile).not.toHaveBeenCalled()
})

it("releases a File View that finishes opening after the sidebar closes", async () => {
  const pending = deferred<PluginOpenResult>()
  openPlugin.mockReturnValue(pending.promise)
  await render()
  await act(async () => root.unmount())
  await act(async () => pending.resolve(plugin("closed")))
  expect(closePlugin).toHaveBeenCalledExactlyOnceWith("closed")
})

it("keeps a shared Eidos Runtime alive across refresh and releases it on close", async () => {
  const snapshot = {
    path: "data.eidos",
    tables: [],
  } as unknown as EidosFileSnapshot
  window.eidosLite.openEidosFile = vi.fn(async (relativePath: string) => ({
    sessionId: "shared",
    relativePath,
    snapshot,
    readOnly: false as const,
  }))
  await render({ relativePath: "data.eidos" })
  expect(container.querySelector("[data-eidos-path]")).not.toBeNull()
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('[aria-label="Refresh"]')!
      .click()
  )
  expect(props.onReleaseEidosFile).not.toHaveBeenCalled()
  await act(async () => root.unmount())
  expect(props.onReleaseEidosFile).toHaveBeenCalledExactlyOnceWith("shared")
})
