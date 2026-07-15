import { describe, expect, it } from "vitest"

import { assessLegacyExtensionPortability } from "./extension-portability"
import type { LegacyExtension } from "./types"

function extension(overrides: Partial<LegacyExtension> = {}): LegacyExtension {
  return {
    id: "ext_1",
    slug: "task-counter",
    name: "Task Counter",
    description: null,
    type: "script",
    version: "0.1.0",
    code: "export default function () {}",
    tsCode: "export default function () {}",
    metaJson: JSON.stringify({
      type: "tableAction",
      tableAction: { name: "Count tasks", description: "Count tasks" },
    }),
    icon: null,
    marketplaceId: null,
    enabled: false,
    bindingsJson: null,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  }
}

describe("legacy extension portability assessment", () => {
  it.each(["tableAction", "docAction", "fileAction"])(
    "maps %s to a manual command port without claiming automatic compatibility",
    (type) => {
      const result = assessLegacyExtensionPortability(
        extension({ metaJson: JSON.stringify({ type }) })
      )

      expect(result).toMatchObject({
        readiness: "manual-port",
        reasonCode: "manual-command-port",
        legacyContribution: type,
        candidateContribution: "command",
        metadataState: "valid",
        sourceState: "typescript-and-javascript",
      })
      expect(result.manualSteps.join(" ")).toContain("do not execute")
    }
  )

  it("maps file handlers to a reviewed file-editor candidate and preserves selectors", () => {
    const result = assessLegacyExtensionPortability(
      extension({
        type: "block",
        metaJson: JSON.stringify({
          type: "fileHandler",
          fileHandler: { extensions: [".md", ".notes.md", 42, ""] },
        }),
      })
    )

    expect(result).toMatchObject({
      readiness: "manual-port",
      reasonCode: "manual-file-editor-port",
      legacyContribution: "fileHandler",
      candidateContribution: "file-editor",
      legacyFileExtensions: [".md", ".notes.md"],
    })
  })

  it.each(["tableView", "extNode", "folderHandler", "tool", "udf"])(
    "blocks unsupported v1 contribution %s",
    (type) => {
      expect(
        assessLegacyExtensionPortability(
          extension({ metaJson: JSON.stringify({ type }) })
        )
      ).toMatchObject({
        readiness: "blocked-by-v1",
        reasonCode: "unsupported-contribution",
        legacyContribution: type,
        candidateContribution: null,
      })
    }
  )

  it("distinguishes missing and invalid metadata without rewriting either", () => {
    expect(
      assessLegacyExtensionPortability(extension({ metaJson: null }))
    ).toMatchObject({
      readiness: "needs-review",
      reasonCode: "metadata-missing",
      metadataState: "missing",
    })
    expect(
      assessLegacyExtensionPortability(extension({ metaJson: "{broken" }))
    ).toMatchObject({
      readiness: "needs-review",
      reasonCode: "metadata-invalid",
      metadataState: "invalid",
    })
  })

  it("distinguishes valid metadata without a contribution type", () => {
    expect(
      assessLegacyExtensionPortability(extension({ metaJson: "{}" }))
    ).toMatchObject({
      readiness: "needs-review",
      reasonCode: "contribution-missing",
      metadataState: "valid",
    })
  })

  it("treats a record without any stored source as archive-only evidence", () => {
    expect(
      assessLegacyExtensionPortability(extension({ code: null, tsCode: null }))
    ).toMatchObject({
      readiness: "source-missing",
      reasonCode: "source-missing",
      legacyContribution: "tableAction",
      candidateContribution: null,
      sourceState: "missing",
    })
  })
})
