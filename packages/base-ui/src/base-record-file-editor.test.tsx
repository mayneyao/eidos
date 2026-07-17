// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { decodeBaseFilePaths, encodeBaseFilePaths } from "@eidos.space/base"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { BaseRecordFileEditor } from "./base-record-file-editor"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

describe("BaseRecordFileEditor", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("imports and removes Space files without a modal editor", async () => {
    const onChange = vi.fn(async (_value: string | null) => undefined)
    const onImportFiles = vi.fn(async () => ["assets/new.png"])
    await act(async () => {
      root.render(
        <BaseRecordFileEditor
          value={encodeBaseFilePaths(["assets/old.png"])}
          disabled={false}
          onChange={onChange}
          onImportFiles={onImportFiles}
        />
      )
    })

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent?.includes("Add files"))
        ?.click()
      await Promise.resolve()
    })
    expect(onImportFiles).toHaveBeenCalledTimes(1)
    expect(decodeBaseFilePaths(onChange.mock.calls[0]?.[0])).toEqual([
      "assets/old.png",
      "assets/new.png",
    ])

    onChange.mockClear()
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[aria-label="Remove assets/old.png"]'
        )
        ?.click()
      await Promise.resolve()
    })
    expect(decodeBaseFilePaths(onChange.mock.calls[0]?.[0])).toEqual([])
  })
})
