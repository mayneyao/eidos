import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { expect, it } from "vitest"
import { isDevelopmentReadonlyRoot } from "./development-readonly"

it("protects exactly the canonical development root and never changes packaged or unrelated Spaces", async () => {
  const temporary = await fs.mkdtemp(
    path.join(os.tmpdir(), "eidos-readonly-policy-")
  )
  try {
    const root = await fs.realpath(temporary)
    await fs.symlink(root, path.join(root, "alias"))
    expect(
      await isDevelopmentReadonlyRoot(root, false, path.join(root, "alias"))
    ).toBe(true)
    expect(
      await isDevelopmentReadonlyRoot(path.join(root, "sibling"), false, root)
    ).toBe(false)
    expect(await isDevelopmentReadonlyRoot(root, true, root)).toBe(false)
    await expect(
      isDevelopmentReadonlyRoot(root, false, "relative")
    ).rejects.toThrow(/absolute/)
  } finally {
    await fs.rm(temporary, { recursive: true, force: true })
  }
})
