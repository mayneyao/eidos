import fs from "node:fs/promises"
import path from "node:path"

import { SpaceOperationGate } from "../operation-gate"
import { SpaceOperationJournal } from "../operation-journal"

const [stateDirectory, worktree] = process.argv.slice(2)
if (!stateDirectory || !worktree) {
  throw new Error("materialization crash fixture requires state and worktree")
}

const gate = new SpaceOperationGate(new SpaceOperationJournal(stateDirectory), {
  closeRuntimes: async () => {
    await fs.writeFile(path.join(stateDirectory, "handles-closed"), "closed\n")
  },
  validateWorktree: async () => {
    throw new Error("the fixture must terminate before validation")
  },
  reopenRuntimes: async () => {
    throw new Error("the fixture must terminate before reopen")
  },
})

await gate.withMaterialization({
  kind: "pull-hosted-sync",
  detail: "Testing application termination during pull",
  materialize: async () => {
    await fs.writeFile(
      path.join(worktree, "notes.txt"),
      "partially materialized remote content\n"
    )
    process.send?.({ phase: "materializing" })
    await new Promise<never>(() => {
      setInterval(() => undefined, 1_000)
    })
  },
})
