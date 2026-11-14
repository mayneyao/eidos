// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, expect, it, vi } from "vitest"
import type { TextFilePreviewResult } from "../shared/contracts"
import { TextFilePreview } from "./text-file-preview"

vi.mock("./markdown-editor-surface", () => ({
  prepareMarkdownEditorSurface: async () => undefined,
  MarkdownEditorSurface: ({
    content,
    onChange,
  }: {
    content: string
    onChange(value: string): void
  }) => (
    <textarea
      defaultValue={content}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  ),
}))
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let root: ReturnType<typeof createRoot> | undefined
let host: HTMLDivElement | undefined
afterEach(async () => {
  await act(async () => root?.unmount())
  host?.remove()
})

const preview = (
  relativePath: string
): Extract<TextFilePreviewResult, { type: "text" }> => ({
  type: "text",
  relativePath,
  content: "original",
  revision: "one",
  encoding: "utf-8",
  bom: false,
  size: 8,
  modifiedAtMs: 1,
  truncated: false,
  browserPreview: { kind: "markdown" },
})

it.each(["darwin", "win32"])(
  "saves the interacted pane after focus leaves its text on %s, while search/dialog keep ownership",
  async (platform) => {
    const save = vi.fn(
      async ({
        relativePath,
        content,
      }: {
        relativePath: string
        content: string
      }) => ({
        status: "saved",
        file: { ...preview(relativePath), content, revision: "two" },
      })
    )
    Object.assign(window, { eidosLite: { saveTextFile: save } })
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
    const props = (path: string) => ({
      preview: preview(path),
      draft: { content: path, revision: "one" },
      theme: "light" as const,
      platform,
      onSaved: vi.fn(),
      onReload: vi.fn(),
      onReveal: vi.fn(),
      onDraftChange: vi.fn(),
    })
    await act(async () =>
      root!.render(
        <>
          <button data-explorer>Explorer</button>
          <input type="search" />
          <aside className="file-sidebar">
            <button data-sidebar>Sidebar title</button>
            <TextFilePreview {...props("side.md")} />
          </aside>
          <TextFilePreview {...props("main.md")} />
        </>
      )
    )
    const key = () =>
      new KeyboardEvent("keydown", {
        key: "s",
        ctrlKey: platform === "win32",
        metaKey: platform === "darwin",
        bubbles: true,
        cancelable: true,
      })
    // Sidebar mounted first, but completing a read is not a user activation.
    const explorer = host.querySelector<HTMLButtonElement>("[data-explorer]")!
    explorer.focus()
    await act(async () => explorer.dispatchEvent(key()))
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ relativePath: "main.md", content: "main.md" })
    )
    expect(save).toHaveBeenCalledTimes(1)
    host.querySelector<HTMLButtonElement>("[data-sidebar]")!.focus()
    explorer.focus()
    const search = host.querySelector<HTMLInputElement>("input")!
    search.focus()
    await act(async () => search.dispatchEvent(key()))
    expect(save).toHaveBeenCalledTimes(1)
    explorer.focus()
    const dialog = document.createElement("div")
    dialog.setAttribute("role", "dialog")
    dialog.setAttribute("aria-modal", "true")
    host.append(dialog)
    await act(async () => explorer.dispatchEvent(key()))
    expect(save).toHaveBeenCalledTimes(1)
    dialog.remove()
    await act(async () => explorer.dispatchEvent(key()))
    expect(save).toHaveBeenLastCalledWith(
      expect.objectContaining({ relativePath: "side.md", content: "side.md" })
    )
    expect(save).toHaveBeenCalledTimes(2)
    expect(host.textContent).toContain("Saved to disk")
  }
)

it("shows saving and failure, retains the draft and retries from the visible Save action", async () => {
  let reject!: (error: Error) => void
  const save = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail
        })
    )
    .mockResolvedValue({
      status: "saved",
      file: { ...preview("main.md"), content: "draft", revision: "two" },
    })
  Object.assign(window, { eidosLite: { saveTextFile: save } })
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  const changed = vi.fn()
  await act(async () =>
    root!.render(
      <TextFilePreview
        preview={preview("main.md")}
        draft={{ content: "draft", revision: "one" }}
        theme="light"
        platform="win32"
        onSaved={vi.fn()}
        onReload={vi.fn()}
        onReveal={vi.fn()}
        onDraftChange={changed}
      />
    )
  )
  const button = () => host!.querySelector<HTMLButtonElement>("footer button")!
  expect(host.textContent).toContain("Unsaved changes")
  expect(button().title).toBe("Save main.md (Ctrl+S)")
  await act(async () => button().click())
  expect(host.textContent).toContain("Saving…")
  await act(async () => reject(new Error("Permission denied")))
  expect(host.textContent).toContain(
    "Save failed: Check write access to this file's folder and try again. Your draft is kept."
  )
  expect(host.querySelector("textarea")?.value).toBe("draft")
  expect(changed).not.toHaveBeenCalled()
  await act(async () => button().click())
  expect(save).toHaveBeenCalledTimes(2)
  expect(host.textContent).toContain("Saved to disk")
  expect(changed).toHaveBeenCalledWith("main.md", null)
})
