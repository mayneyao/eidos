// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { EidosFileFieldInfo } from "@eidos.space/eidos-file"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  EidosFileRecordPage,
  EidosFileRecordUnavailable,
} from "./eidos-file-record-page"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const fields: EidosFileFieldInfo[] = [
  {
    id: "field-title",
    tableId: "tasks",
    name: "Title",
    type: "text",
    tableName: "tb_tasks",
    tableColumnName: "title",
    property: null,
    storageCodec: "scalar",
    valueKind: "source",
    isRecordLabel: true,
    isHidden: false,
    isDerived: false,
    sourceTableColumnName: null,
    dependsOn: null,
  },
]

describe("EidosFileRecordPage", () => {
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

  it("keeps Eidos File context in a compact workbar and edits in the page surface", async () => {
    const onBack = vi.fn()
    const onDismissError = vi.fn()
    await act(async () => {
      root.render(
        <EidosFileRecordPage
          eidosFileName="tasks.eidos"
          tableName="Tasks"
          row={{ _id: "row_1", title: "Write RFC" }}
          fields={fields}
          error="Attachment import failed"
          onBack={onBack}
          onDismissError={onDismissError}
          onCopyRecordId={vi.fn()}
        />
      )
    })

    expect(container.textContent).toContain("tasks.eidos")
    expect(container.textContent).toContain("Tasks")
    expect(container.textContent).toContain("Write RFC")
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Attachment import failed"
    )
    expect(
      container.querySelector('[data-eidos-file-record-layout="page"]')
    ).not.toBeNull()

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent?.includes("Back to Eidos File"))
        ?.click()
      container
        .querySelector<HTMLButtonElement>(
          '[aria-label="Dismiss Eidos File error"]'
        )
        ?.click()
    })
    expect(onBack).toHaveBeenCalledOnce()
    expect(onDismissError).toHaveBeenCalledOnce()
  })

  it("offers a non-modal escape when the requested table is gone", async () => {
    const onBack = vi.fn()
    await act(async () => {
      root.render(
        <EidosFileRecordUnavailable
          eidosFileName="tasks.eidos"
          message="This table no longer exists."
          onBack={onBack}
        />
      )
    })

    expect(container.textContent).toContain("Unable to open record")
    expect(container.textContent).toContain("This table no longer exists.")
    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Back to Eidos File")
        ?.click()
    })
    expect(onBack).toHaveBeenCalledOnce()
  })
})
