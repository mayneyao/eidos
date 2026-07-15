import { describe, expect, it } from "vitest"

import { calculateLegacyExtensionArchiveDigest } from "./legacy-archive"

describe("calculateLegacyExtensionArchiveDigest", () => {
  const records = [
    {
      archivePath: "legacy-extension.json",
      content: Buffer.from('{"formatVersion":2}\n'),
    },
    {
      archivePath: "src/extension.ts",
      content: Buffer.from("export const legacy = true\n"),
    },
  ]

  it("is stable across archive locations and directory enumeration order", () => {
    expect(calculateLegacyExtensionArchiveDigest(records)).toBe(
      calculateLegacyExtensionArchiveDigest([...records].reverse())
    )
    expect(calculateLegacyExtensionArchiveDigest(records)).toBe(
      "sha256:32730e1e89e8cc054b5dc1691810b88e64cb73f76f7c8824d6ade43db42f1811"
    )
  })

  it("changes with exact source bytes and rejects ambiguous paths", () => {
    expect(
      calculateLegacyExtensionArchiveDigest([
        records[0]!,
        {
          ...records[1]!,
          content: Buffer.from("export const legacy = false\n"),
        },
      ])
    ).not.toBe(calculateLegacyExtensionArchiveDigest(records))
    expect(() =>
      calculateLegacyExtensionArchiveDigest([records[0]!, records[0]!])
    ).toThrow(/Duplicate/)
    expect(() =>
      calculateLegacyExtensionArchiveDigest([
        { archivePath: "../source.ts", content: Buffer.from("") },
      ])
    ).toThrow(/Invalid/)
  })
})
