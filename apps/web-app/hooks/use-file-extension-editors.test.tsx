import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import {
  type FileExtensionEditor,
  useFileExtensionEditors,
} from "./use-file-extension-editors"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const listFileEditorsMock = vi.hoisted(() => vi.fn())
const onMock = vi.hoisted(() => vi.fn(() => "listener-1"))
const offMock = vi.hoisted(() => vi.fn())

vi.mock("@/lib/env", () => ({ isDesktopMode: true }))

describe("useFileExtensionEditors", () => {
  let container: HTMLDivElement
  let root: Root
  let hook: ReturnType<typeof useFileExtensionEditors> | undefined

  beforeEach(() => {
    listFileEditorsMock.mockReset()
    onMock.mockClear()
    offMock.mockClear()
    hook = undefined
    Object.defineProperty(window, "eidos", {
      configurable: true,
      value: {
        on: onMock,
        off: offMock,
        fileExtensions: {
          listFileEditors: listFileEditorsMock,
        },
      },
    })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    Reflect.deleteProperty(window, "eidos")
  })

  it("reports transient failures without caching them as no match", async () => {
    const onLoadError = vi.fn()
    function Probe() {
      hook = useFileExtensionEditors("space-a", { onLoadError })
      return null
    }
    act(() => root.render(<Probe />))

    listFileEditorsMock.mockRejectedValueOnce(
      new Error("Extension service unavailable")
    )
    let firstResult: FileExtensionEditor[] | undefined
    await act(async () => {
      firstResult = await hook!.load("tasks.md")
    })
    expect(firstResult).toEqual([])
    expect(onLoadError).toHaveBeenCalledWith(
      "tasks.md",
      expect.objectContaining({ message: "Extension service unavailable" })
    )

    const editor = {
      packageId: "example.task-board",
      contentDigest: `sha256:${"1".repeat(64)}`,
      permissionHash: `sha256:${"2".repeat(64)}`,
      id: "example.task-board.editor",
      displayName: "Task Board",
      extensionDisplayName: "Markdown Task Board",
      selector: [{ filenamePattern: "**/*.md" }],
      priority: "option" as const,
      editable: true,
    }
    listFileEditorsMock.mockResolvedValueOnce([editor])
    let secondResult: FileExtensionEditor[] | undefined
    await act(async () => {
      secondResult = await hook!.load("tasks.md")
    })
    expect(secondResult).toEqual([editor])
    expect(listFileEditorsMock).toHaveBeenCalledTimes(2)

    await act(async () => {
      await hook!.load("tasks.md")
    })
    expect(listFileEditorsMock).toHaveBeenCalledTimes(2)
  })
})
