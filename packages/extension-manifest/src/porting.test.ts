import { describe, expect, it } from "vitest"

import { analyzeLegacyExtensionPortingReceipt } from "./porting"

function validReceipt(): Record<string, unknown> {
  return {
    format: "eidos-legacy-extension-port",
    formatVersion: 1,
    source: {
      legacyExtensionId: "legacy-1",
      legacySlug: "task-counter",
      archiveDigest: `sha256:${"a".repeat(64)}`,
    },
    target: {
      canonicalPackageId: "example.task-counter",
      candidateContribution: "command",
    },
    state: "draft",
  }
}

describe("legacy extension porting receipt", () => {
  it("accepts a strict receipt matching the inspected package", () => {
    expect(
      analyzeLegacyExtensionPortingReceipt(JSON.stringify(validReceipt()), {
        expectedCanonicalPackageId: "example.task-counter",
        expectedCandidateContribution: "command",
      })
    ).toMatchObject({
      valid: true,
      diagnostics: [],
      receipt: {
        source: { legacyExtensionId: "legacy-1" },
        target: { canonicalPackageId: "example.task-counter" },
      },
    })
  })

  it("accepts an archive without a legacy slug", () => {
    const receipt = validReceipt()
    receipt.source = {
      ...(receipt.source as Record<string, unknown>),
      legacySlug: null,
    }
    expect(
      analyzeLegacyExtensionPortingReceipt(JSON.stringify(receipt)).valid
    ).toBe(true)
  })

  it("rejects duplicate keys and undeclared fields", () => {
    expect(
      analyzeLegacyExtensionPortingReceipt(
        '{"format":"eidos-legacy-extension-port","format":"eidos-legacy-extension-port"}'
      ).diagnostics[0]?.code
    ).toBe("porting-receipt-json")

    const receipt = validReceipt()
    receipt.unexpected = true
    expect(
      analyzeLegacyExtensionPortingReceipt(JSON.stringify(receipt))
        .diagnostics[0]?.code
    ).toBe("porting-receipt-schema")
  })

  it("rejects receipts targeting another package or contribution", () => {
    const result = analyzeLegacyExtensionPortingReceipt(
      JSON.stringify(validReceipt()),
      {
        expectedCanonicalPackageId: "example.other",
        expectedCandidateContribution: "file-editor",
      }
    )
    expect(result.valid).toBe(false)
    expect(result.receipt).toBeUndefined()
    expect(result.diagnostics).toHaveLength(2)
    expect(
      result.diagnostics.every(
        (item) => item.code === "porting-receipt-target-mismatch"
      )
    ).toBe(true)
  })
})
