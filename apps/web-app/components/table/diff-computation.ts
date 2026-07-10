import { parseDiffFromFile, type FileDiffMetadata } from "@pierre/diffs"

export interface DiffComputationRequest {
  oldContent: string
  newContent: string
  filename: string
}

export type DiffComputationResponse =
  | { diff: FileDiffMetadata; error?: never }
  | { diff?: never; error: string }

export function computeFileDiff({
  oldContent,
  newContent,
  filename,
}: DiffComputationRequest): FileDiffMetadata {
  return parseDiffFromFile(
    { name: filename, contents: oldContent },
    { name: filename, contents: newContent }
  )
}
