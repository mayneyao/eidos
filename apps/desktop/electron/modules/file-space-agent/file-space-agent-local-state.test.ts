// @vitest-environment node

import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { FileSpaceAgentLocalStateStore } from "./file-space-agent-local-state"

const roots: string[] = []

async function createStore() {
  const root = await mkdtemp(path.join(os.tmpdir(), "eidos-agent-local-"))
  roots.push(root)
  return { root, store: new FileSpaceAgentLocalStateStore(root) }
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  )
})

describe("FileSpaceAgentLocalStateStore", () => {
  it("fails closed and persists approval authority outside portable sessions", async () => {
    const { root, store } = await createStore()
    await expect(store.getApprovalMode("conversation-1")).resolves.toBe("ask")
    await expect(
      store.setApprovalMode("conversation-1", "full-access")
    ).resolves.toBe("full-access")
    await expect(store.getApprovalMode("conversation-1")).resolves.toBe(
      "full-access"
    )

    const file = path.join(root, "preferences.json")
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({
      formatVersion: 1,
      approvalModes: { "conversation-1": "full-access" },
    })
    expect((await stat(file)).mode & 0o777).toBe(0o600)
  })

  it("treats corrupt or unsupported local state as Ask", async () => {
    const { root, store } = await createStore()
    await writeFile(
      path.join(root, "preferences.json"),
      JSON.stringify({
        formatVersion: 999,
        approvalModes: { "conversation-1": "full-access" },
      })
    )

    await expect(store.getApprovalMode("conversation-1")).resolves.toBe("ask")
  })
})
