import { describe, it } from "vitest"
import { markdown2lexical } from "./headless"
import { reconcileState } from "./utils/state-reconciliation"

describe("Debug cross-type", () => {
  it("should preserve ID when heading becomes paragraph", async () => {
    const oldMd = `## Heading`
    const newMd = `Heading`

    const oldStateStr = await markdown2lexical(oldMd, [], [], {
      useHarness: true,
    })
    const oldState = JSON.parse(oldStateStr)

    const intermediateStr = await markdown2lexical(newMd, [], [], {
      useHarness: false,
    })
    const intermediateState = JSON.parse(intermediateStr)

    console.log("\n=== OLD ===")
    console.log(JSON.stringify(oldState.root.children[0], null, 2))

    console.log("\n=== NEW (before reconcile) ===")
    console.log(JSON.stringify(intermediateState.root.children[0], null, 2))

    const newState = reconcileState(oldState, intermediateState)

    console.log("\n=== NEW (after reconcile) ===")
    console.log(JSON.stringify(newState.root.children[0], null, 2))

    const oldPid = oldState.root.children[0].$?.pid
    const newPid = newState.root.children[0].$?.pid

    console.log(`\nOld PID: ${oldPid}`)
    console.log(`New PID: ${newPid}`)
    console.log(`Preserved: ${oldPid === newPid}`)
  })
})
