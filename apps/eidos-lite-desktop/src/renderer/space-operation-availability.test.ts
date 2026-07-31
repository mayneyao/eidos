import { describe, expect, it } from "vitest"

import type { SpaceOperationPhase } from "../shared/contracts"
import { blocksLocalInteraction } from "./space-operation-availability"

describe("blocksLocalInteraction", () => {
  it.each<SpaceOperationPhase>(["ready", "syncing"])(
    "keeps local work available while the Space is %s",
    (phase) => {
      expect(blocksLocalInteraction(phase)).toBe(false)
    }
  )

  it.each<SpaceOperationPhase>([
    "quiescing",
    "materializing",
    "validating",
    "reopening",
    "failed",
    "closed",
  ])("blocks local work while the Space is %s", (phase) => {
    expect(blocksLocalInteraction(phase)).toBe(true)
  })
})
