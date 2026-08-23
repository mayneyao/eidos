import { describe, expect, it } from "vitest"

import {
  clampPublishPanelPosition,
  defaultPublishSlug,
  isPublishableEntry,
  publishFormViewLabel,
} from "./publish-panel"

describe("Publish panel", () => {
  it("derives a safe editable slug from an Eidos File name", () => {
    expect(defaultPublishSlug("Project Notes.eidos")).toBe("project-notes")
    expect(defaultPublishSlug("---.eidos")).toBe("untitled")
    expect(defaultPublishSlug(`${"a".repeat(80)}.eidos`)).toHaveLength(64)
    expect(defaultPublishSlug("Release Notes.markdown")).toBe("release-notes")
  })

  it("offers Publish only for supported source files", () => {
    expect(
      isPublishableEntry({
        name: "guide.md",
        relativePath: "guide.md",
        kind: "file",
        size: 1,
        modifiedAtMs: 1,
      })
    ).toBe(true)
    expect(
      isPublishableEntry({
        name: "notes.txt",
        relativePath: "notes.txt",
        kind: "file",
        size: 1,
        modifiedAtMs: 1,
      })
    ).toBe(false)
  })

  it("identifies Form publish targets by Table and View name", () => {
    expect(
      publishFormViewLabel("Form", {
        name: "Form 1",
        tableName: "Contacts",
      })
    ).toBe("Form · Contacts · Form 1")
    expect(
      publishFormViewLabel("表单", {
        name: "表单 1",
        tableName: "客户",
      })
    ).toBe("表单 · 客户 · 表单 1")
  })

  it("keeps the measured panel inside the viewport near its anchor", () => {
    expect(clampPublishPanelPosition(700, 500, 352, 220, 800, 600)).toEqual({
      left: 440,
      top: 372,
    })
    expect(clampPublishPanelPosition(2, 3, 352, 720, 320, 600)).toEqual({
      left: 8,
      top: 8,
    })
  })
})
