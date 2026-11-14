// @vitest-environment jsdom
import { act, useState, type ComponentProps } from "react"
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

function Pane(props: ComponentProps<typeof TextFilePreview>) {
  const [target, setTarget] = useState<HTMLSpanElement | null>(null)
  return (
    <>
      <header data-title-for={props.preview.relativePath}>
        <strong>{props.preview.relativePath}</strong>
        <span className="text-file-save-slot" ref={setTarget} />
      </header>
      <TextFilePreview {...props} saveStatusTarget={target} />
    </>
  )
}

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
            <Pane {...props("side.md")} />
          </aside>
          <Pane {...props("main.md")} />
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
      <Pane
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
  const button = () =>
    host!.querySelector<HTMLButtonElement>(
      "header .text-file-title-save-action"
    )!
  expect(host.textContent).toContain("Unsaved changes")
  expect(host.querySelector(".text-file-editor footer")).toBeNull()
  expect(button().closest("header")?.dataset.titleFor).toBe("main.md")
  expect(button().title).toBe("Save main.md (Ctrl+S)")
  await act(async () => button().click())
  expect(host.textContent).toContain("Saving…")
  await act(async () => reject(new Error("Permission denied")))
  expect(host.textContent).toContain(
    "Save failed: Check write access to this file's folder and try again. Your draft is kept."
  )
  expect(host.querySelector("textarea")?.value).toBe("draft")
  expect(changed).not.toHaveBeenCalled()
  expect(button().textContent).toContain("Retry")
  await act(async () => button().click())
  expect(save).toHaveBeenCalledTimes(2)
  expect(host.textContent).toContain("Saved to disk")
  expect(host.querySelector("header button")).toBeNull()
  expect(changed).toHaveBeenCalledWith("main.md", null)
})

it.each(["darwin", "win32"])(
  "keeps each title Save and its shortcut bound to its own pane on %s",
  async (platform) => {
    // Keep both drafts dirty, so a wrong-target save cannot hide behind a
    // clean document's no-op. Rejections also exercise the header Retry path.
    const save = vi.fn().mockRejectedValue(new Error("ENOSPC"))
    Object.assign(window, { eidosLite: { saveTextFile: save } })
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
    const props = (path: string) => ({
      preview: path.endsWith(".txt")
        ? { ...preview(path), browserPreview: undefined }
        : preview(path),
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
          <Pane {...props("main.md")} />
          <aside className="file-sidebar">
            <Pane {...props("side.txt")} />
          </aside>
        </>
      )
    )
    const titleButton = (path: string) =>
      host!.querySelector<HTMLButtonElement>(
        `[data-title-for="${path}"] button`
      )!
    const key = () =>
      new KeyboardEvent("keydown", {
        key: "s",
        metaKey: platform === "darwin",
        ctrlKey: platform !== "darwin",
        bubbles: true,
        cancelable: true,
      })
    for (const path of ["side.txt", "main.md", "side.txt"]) {
      // Deliberately activate the other editor first.
      const other = path === "main.md" ? "side.txt" : "main.md"
      host
        .querySelector<HTMLTextAreaElement>(
          `[data-text-file-editor="${other}"] textarea`
        )!
        .focus()
      await act(async () => titleButton(path).click())
      expect(save).toHaveBeenLastCalledWith({
        relativePath: path,
        content: path,
        expectedRevision: "one",
      })
      titleButton(path).focus()
      await act(async () => titleButton(path).dispatchEvent(key()))
      expect(save).toHaveBeenLastCalledWith({
        relativePath: path,
        content: path,
        expectedRevision: "one",
      })
    }
    expect(save).toHaveBeenCalledTimes(6)
    const search = document.createElement("input")
    search.type = "search"
    host.append(search)
    search.focus()
    await act(async () => search.dispatchEvent(key()))
    const dialog = document.createElement("div")
    dialog.setAttribute("role", "dialog")
    dialog.setAttribute("aria-modal", "true")
    host.append(dialog)
    await act(async () => titleButton("main.md").dispatchEvent(key()))
    expect(save).toHaveBeenCalledTimes(6)
  }
)

it("keeps disk-conflict recovery and draft-copy actions after removing the footer", async () => {
  const current = {
    ...preview("main.md"),
    content: "external",
    revision: "external",
  }
  const save = vi.fn().mockResolvedValue({ status: "conflict", current })
  const saveCopy = vi.fn().mockResolvedValue(true)
  const changed = vi.fn()
  const saved = vi.fn()
  Object.assign(window, {
    eidosLite: { saveTextFile: save, saveTextDraftCopy: saveCopy },
  })
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  await act(async () =>
    root!.render(
      <Pane
        preview={preview("main.md")}
        draft={{ content: "draft", revision: "one" }}
        theme="light"
        platform="darwin"
        onSaved={saved}
        onReload={vi.fn()}
        onReveal={vi.fn()}
        onDraftChange={changed}
      />
    )
  )
  await act(async () =>
    host!.querySelector<HTMLButtonElement>("header button")!.click()
  )
  expect(
    host.querySelector("header [data-save-state='conflict']")
  ).not.toBeNull()
  expect(host.querySelector<HTMLButtonElement>("header button")!.disabled).toBe(
    true
  )
  expect(host.querySelector("textarea")?.value).toBe("draft")
  const action = (label: string) =>
    Array.from(
      host!.querySelectorAll<HTMLButtonElement>("[role='alert'] button")
    ).find((button) => button.textContent === label)!
  await act(async () => action("Save a copy").click())
  expect(saveCopy).toHaveBeenCalledWith("main.md", "draft")
  expect(changed).not.toHaveBeenCalled()
  expect(host.textContent).toContain(
    "Copy saved. The original draft is still unsaved."
  )
  await act(async () => action("Reload from disk").click())
  expect(saved).toHaveBeenCalledWith(current)
  expect(changed).toHaveBeenCalledWith("main.md", null)
  expect(host.querySelector("[role='alert']")).toBeNull()
  expect(host.querySelector("header button")).toBeNull()
})
