import type { SpacePathSearchHit, SpacePathMutationResult } from "./contracts"

export interface MarkdownLinkMove {
  source: string
  relativePath: string
}

export type MarkdownLinkBatchOperation =
  | { kind: "prepare"; root: string; files: SpacePathSearchHit[] }
  | { kind: "apply"; moves: MarkdownLinkMove[] }

export interface PreparedMarkdownLinkBatch {
  owners: string[]
  stats: {
    snapshots: number
    files: number
    parsedDocuments: number
    contentDocuments: number
    eidosReads: number
  }
}

export type MarkdownLinkBatchResult = NonNullable<
  SpacePathMutationResult["markdownLinks"]
>
