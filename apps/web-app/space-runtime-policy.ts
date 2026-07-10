import type { SpaceMode } from "@eidos.space/space-manager"

export function shouldEnableLegacySpaceRuntime(
  mode: SpaceMode | undefined
): boolean {
  return mode === "legacy"
}
