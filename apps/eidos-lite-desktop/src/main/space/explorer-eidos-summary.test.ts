import fs from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { expect, it, vi } from "vitest"
import { readExplorerEidosSummary } from "./explorer-eidos-summary"
import { normalizeExplorerSummaryRequest } from "../../shared/explorer-summary"

it("checks the indexed version and rejects unsafe paths or in-flight replacements", async () => {
  const root = await fs.realpath(
    await fs.mkdtemp(path.join(tmpdir(), "explorer-summary-path-"))
  )
  try {
    const file = path.join(root, "data.eidos")
    await fs.writeFile(file, "fixture")
    const stats = await fs.stat(file)
    const request = {
      spaceId: "space",
      relativePath: "data.eidos",
      size: stats.size,
      modifiedAtMs: stats.mtimeMs,
    }
    const summary = { tableNames: ["Tasks"], tableCount: 1, recordCount: 2 }
    const inspect = vi.fn(async () => summary)
    expect(await readExplorerEidosSummary(root, request, inspect)).toEqual(
      summary
    )
    expect(
      await readExplorerEidosSummary(root, { ...request, size: 999 }, inspect)
    ).toBeNull()
    expect(inspect).toHaveBeenCalledTimes(1)
    await expect(
      readExplorerEidosSummary(
        root,
        { ...request, relativePath: "../other.eidos" },
        inspect
      )
    ).rejects.toThrow()
    await fs.symlink(file, path.join(root, "link.eidos"))
    await expect(
      readExplorerEidosSummary(
        root,
        { ...request, relativePath: "link.eidos" },
        inspect
      )
    ).rejects.toThrow()
    expect(
      await readExplorerEidosSummary(root, request, async () => {
        await fs.writeFile(file, "modified")
        return summary
      })
    ).toBeNull()
    for (const bad of [
      null,
      {},
      { ...request, size: -1 },
      { ...request, modifiedAtMs: NaN },
      { ...request, relativePath: 7 },
    ])
      expect(() => normalizeExplorerSummaryRequest(bad)).toThrow()
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})
