import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { MarkdownEditor } from "./markdown-editor"
import type { MarkdownEditorProps } from "../types"

let host: HTMLDivElement
let root: Root
const changed = vi.fn()
const error = vi.fn()
const original = "Before\n\n![]()\n\nAfter"

beforeAll(() => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value: function () {
        this.open = true
      },
    },
    close: {
      configurable: true,
      value: function () {
        this.open = false
      },
    },
  })
})

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  changed.mockReset()
  error.mockReset()
  Range.prototype.getBoundingClientRect = () => new DOMRect()
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList
  vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(
    function (this: HTMLDialogElement) {
      this.open = true
    }
  )
  vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(
    function (this: HTMLDialogElement) {
      this.open = false
    }
  )
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  document.getSelection()?.removeAllRanges()
  vi.restoreAllMocks()
})

async function render(props: Partial<MarkdownEditorProps> = {}) {
  await act(async () =>
    root.render(
      <MarkdownEditor
        documentKey="image-interactions"
        baseUri="https://local.example/document/"
        markdown={original}
        onMarkdownChange={changed}
        onError={error}
        {...props}
      />
    )
  )
}
function placeholder() {
  return host.querySelector<HTMLButtonElement>(
    "button.eme-efm-image-placeholder"
  )!
}
function pointer(target: Element, type: string, x = 10) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: 10,
    button: 0,
  })
  Object.defineProperties(event, {
    pointerType: { value: "touch" },
    pointerId: { value: 1 },
    isPrimary: { value: true },
  })
  target.dispatchEvent(event)
}
async function tap(target: Element) {
  await act(async () => {
    pointer(target, "pointerdown")
    pointer(target, "pointerup")
    target.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 })
    )
  })
}

it.each(["success", "cancel", "failure"] as const)(
  "activates the placeholder host picker and recovers from %s",
  async (mode) => {
    const pick = vi.fn<NonNullable<MarkdownEditorProps["onImportFiles"]>>(
      async () => {
        if (mode === "failure") throw new Error("Import failed")
        return mode === "cancel"
          ? []
          : [
              {
                markdownUrl: "assets/cover.png",
                name: "Cover",
                mediaType: "image/png",
              },
              {
                markdownUrl: "assets/second.png",
                name: "Second",
                mediaType: "image/png",
              },
            ]
      }
    )
    await render({ onImportFiles: pick })
    expect(placeholder()).not.toBeNull()
    await act(async () => placeholder().click())
    expect(pick).toHaveBeenCalledOnce()
    expect(pick.mock.calls[0][0]).toMatchObject({
      kind: "image",
      signal: expect.any(AbortSignal),
    })
    expect(host.querySelector("[data-source-range-editor]")).toBeNull()
    if (mode === "success") {
      expect(changed.mock.lastCall?.[0]).toContain(
        "![Cover](<assets/cover.png>)"
      )
      expect(changed.mock.lastCall?.[0]).toContain(
        "![Second](<assets/second.png>)"
      )
      expect(host.querySelectorAll("[data-efm-image-block]")).toHaveLength(2)
      expect(changed.mock.lastCall?.[0]).toContain("Before")
      expect(changed.mock.lastCall?.[0]).toContain("After")
    } else {
      expect(changed).not.toHaveBeenCalled()
      expect(placeholder().disabled).toBe(false)
      expect(host.querySelectorAll("[data-efm-image-block]")).toHaveLength(1)
      expect(error).toHaveBeenCalledTimes(mode === "failure" ? 1 : 0)
    }
  }
)

it("opens a native file input and persists the chosen image through the paste host boundary", async () => {
  const persist = vi.fn(async () => ({
    markdownUrl: "assets/local.png",
    alt: "Local",
  }))
  const click = vi.spyOn(HTMLInputElement.prototype, "click")
  await render({ onPasteImage: persist })
  await act(async () => placeholder().click())
  expect(click).toHaveBeenCalledOnce()
  const input = host.querySelector<HTMLInputElement>('input[type="file"]')!
  expect(input.accept).toBe("image/*")
  await act(async () =>
    input.dispatchEvent(new Event("cancel", { bubbles: true }))
  )
  expect(changed).not.toHaveBeenCalled()
  await act(async () => placeholder().click())
  const file = new File(["fixture"], "local.png", { type: "image/png" })
  Object.defineProperty(input, "files", { configurable: true, value: [file] })
  await act(async () =>
    input.dispatchEvent(new Event("change", { bubbles: true }))
  )
  expect(persist).toHaveBeenCalledWith(
    expect.objectContaining({ file, index: 0, total: 1 })
  )
  expect(changed.mock.lastCall?.[0]).toContain("![Local](<assets/local.png>)")
})

it("does not activate a read-only placeholder", async () => {
  const pick = vi.fn(async () => [])
  await render({ readOnly: true, onImportFiles: pick })
  await tap(host.querySelector("[data-efm-image-block]")!)
  expect(pick).not.toHaveBeenCalled()
  expect(changed).not.toHaveBeenCalled()
})

it("lets the mobile placeholder import without opening image settings or source", async () => {
  const pick = vi.fn(async () => [])
  await render({ toolbarMode: "mobile", onImportFiles: pick })
  await tap(placeholder())
  expect(pick).toHaveBeenCalledOnce()
  expect(host.querySelector("dialog, [data-source-range-editor]")).toBeNull()
})

it("keeps one pending import and discards its result after becoming read-only", async () => {
  let complete!: (
    files: { markdownUrl: string; name: string; mediaType: string }[]
  ) => void
  let signal!: AbortSignal
  const pick = vi.fn<NonNullable<MarkdownEditorProps["onImportFiles"]>>(
    (request) => {
      signal = request.signal
      return new Promise((resolve) => {
        complete = resolve
      })
    }
  )
  await render({ onImportFiles: pick })
  await act(async () => {
    placeholder().click()
    placeholder().click()
  })
  expect(pick).toHaveBeenCalledOnce()
  expect(placeholder().disabled).toBe(true)
  await render({ onImportFiles: pick, readOnly: true })
  expect(signal.aborted).toBe(true)
  await act(async () =>
    complete([
      {
        markdownUrl: "assets/stale.png",
        name: "Stale",
        mediaType: "image/png",
      },
    ])
  )
  expect(changed).not.toHaveBeenCalled()
  await render({ onImportFiles: pick })
  expect(placeholder().disabled).toBe(false)
})

it("rejects an unsafe host result without replacing the placeholder", async () => {
  await render({
    onImportFiles: async () => [
      {
        markdownUrl: "javascript:alert(1)",
        name: "Unsafe",
        mediaType: "image/png",
      },
    ],
  })
  await act(async () => placeholder().click())
  expect(changed).not.toHaveBeenCalled()
  expect(error).toHaveBeenCalledOnce()
  expect(placeholder().disabled).toBe(false)
})

it("opens image settings on a real short-touch sequence and cancels without changing the document", async () => {
  await render({
    toolbarMode: "mobile",
    markdown: "Before\n\n![Cover](assets/cover.png)\n\nAfter",
  })
  await tap(host.querySelector("img")!)
  expect(host.querySelector("[data-source-range-editor]")).toBeNull()
  const sheet = host.querySelector<HTMLDialogElement>(
    ".eme-mobile-image-sheet"
  )!
  expect(sheet?.open).toBe(true)
  const alt = sheet.querySelectorAll("input")[1]
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!.call(alt, "Discard me")
    alt.dispatchEvent(new Event("input", { bubbles: true }))
  })
  await act(async () =>
    sheet.dispatchEvent(new Event("cancel", { cancelable: true }))
  )
  expect(host.querySelector("dialog")).toBeNull()
  expect(host.querySelector("img")?.alt).toBe("Cover")
  expect(changed).not.toHaveBeenCalled()
  await tap(host.querySelector("img")!)
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>(
        'button[aria-label="Close image settings"]'
      )!
      .click()
  )
  expect(host.querySelector("dialog")).toBeNull()
})

it.each(["move", "pointercancel"])(
  "keeps a touch %s gesture from entering image settings or source",
  async (mode) => {
    await render({
      toolbarMode: "mobile",
      markdown: "![Cover](assets/cover.png)",
    })
    const image = host.querySelector("img")!
    await act(async () => {
      pointer(image, "pointerdown")
      pointer(image, mode === "move" ? "pointermove" : "pointercancel", 40)
      pointer(image, "pointerup", 40)
      image.click()
    })
    expect(host.querySelector("dialog")).toBeNull()
    expect(host.querySelector("[data-source-range-editor]")).toBeNull()
    expect(changed).not.toHaveBeenCalled()
  }
)
