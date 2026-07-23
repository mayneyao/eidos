// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  decodeEidosFileValues,
  encodeEidosFileAttachmentPaths,
  type FileEntry,
} from "@eidos.space/eidos-file"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { EidosFileRecordAttachmentEditor } from "./eidos-file-record-attachment-editor"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

describe("EidosFileRecordAttachmentEditor", () => {
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
    const imported: FileEntry = {
      id: "0198c6b9-c9a3-7cb9-82d0-dfb39d51c45e",
      mediaType: "image/png",
      name: "new.png",
      size: "42",
      uri: "assets/new.png",
    }
    const onImportFiles = vi.fn(async () => [imported])
    await act(async () => {
      root.render(
        <EidosFileRecordAttachmentEditor
          value={encodeEidosFileAttachmentPaths(["assets/old.png"])}
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
    expect(
      decodeEidosFileValues(onChange.mock.calls[0]?.[0]).map(
        (entry) => entry.uri
      )
    ).toEqual(["assets/old.png", "assets/new.png"])

    onChange.mockClear()
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[aria-label="Remove old.png"]')
        ?.click()
      await Promise.resolve()
    })
    expect(decodeEidosFileValues(onChange.mock.calls[0]?.[0])).toEqual([])
  })
})
