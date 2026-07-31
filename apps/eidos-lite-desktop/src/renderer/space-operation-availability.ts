import type { SpaceOperationPhase } from "../shared/contracts"

export function blocksLocalInteraction(phase: SpaceOperationPhase): boolean {
  return phase !== "ready" && phase !== "syncing"
}
