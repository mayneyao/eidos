import { parseDiffFromFile, type FileDiffMetadata } from "@pierre/diffs"

export interface VersionTextDiffComputationRequest {
  before: string
  after: string
  path: string
}

export type VersionTextDiffComputationResponse =
  | { diff: FileDiffMetadata; error?: never }
  | { diff?: never; error: string }

export function computeVersionTextDiff({
  before,
  after,
  path,
}: VersionTextDiffComputationRequest): FileDiffMetadata {
  return parseDiffFromFile(
    { name: path, contents: before },
    { name: path, contents: after }
  )
}
