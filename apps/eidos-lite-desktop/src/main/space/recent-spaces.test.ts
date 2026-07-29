import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { RecentSpacesStore } from "./recent-spaces"

describe("RecentSpacesStore", () => {
  it("deduplicates canonical Spaces and marks missing folders", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-recents-"))
    const first = path.join(root, "first")
    const second = path.join(root, "second")
    await Promise.all([fs.mkdir(first), fs.mkdir(second)])
    const store = new RecentSpacesStore(path.join(root, "state", "recent.json"))
    await store.record({
      id: "first-id",
      root: first,
      name: "First",
      displayPath: first,
      identity: "first",
    })
    await store.record({
      id: "second-id",
      root: second,
      name: "Second",
      displayPath: second,
      identity: "second",
    })
    await store.record({
      id: "first-id",
      root: first,
      name: "First renamed",
      displayPath: first,
      identity: "first",
    })
    await fs.rm(second, { recursive: true })

    const entries = await store.list()
    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({
      id: "first-id",
      name: "First renamed",
      available: true,
    })
    expect(entries[1]).toMatchObject({ id: "second-id", available: false })
    await store.remove("second-id")
    await expect(store.pathFor("second-id")).resolves.toBeNull()
    await fs.rm(root, { recursive: true, force: true })
  })
})
