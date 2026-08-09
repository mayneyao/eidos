import { describe, expect, it } from "vitest"

import { firstTableTemplate, resolveServeEditorState } from "./empty-file"

describe("CLI-hosted empty Eidos Files", () => {
  it("shows an empty state after a zero-table file is ready", () => {
    expect(
      resolveServeEditorState({
        bootPhase: "ready",
        hasSnapshot: true,
        hasClient: true,
        hasActiveTable: false,
      })
    ).toBe("empty")
  })

  it("keeps showing loading until the runtime session is ready", () => {
    expect(
      resolveServeEditorState({
        bootPhase: "opening",
        hasSnapshot: false,
        hasClient: false,
        hasActiveTable: false,
      })
    ).toBe("loading")
  })

  it("enters the editor when the snapshot has an active table", () => {
    expect(
      resolveServeEditorState({
        bootPhase: "ready",
        hasSnapshot: true,
        hasClient: true,
        hasActiveTable: true,
      })
    ).toBe("editor")
  })

  it("builds localized first-table templates", () => {
    expect(firstTableTemplate("blank", "en")).toEqual({ name: "Table" })
    expect(firstTableTemplate("tasks", "zh")).toMatchObject({
      name: "任务",
      fields: [
        {
          name: "任务",
          type: "text",
          isRecordLabel: true,
          nullable: true,
        },
        { name: "状态", type: "select", nullable: true },
        { name: "截止日期", type: "date", nullable: true },
      ],
    })
  })
})
