import type { PathContentState, RepositorySession } from "@eidos.space/graft"

import type {
  SpaceVersionTextContentDiff,
  SpaceVersionTextContentRequest,
  SpaceVersionTextContentState,
} from "../../shared/contracts"

function projectContentState(
  content: PathContentState
): SpaceVersionTextContentState {
  switch (content.state) {
    case "absent":
      return { state: "absent" }
    case "utf8":
      return {
        state: "utf8",
        content: content.content,
        size: content.size,
      }
    case "too_large":
    case "missing_payload":
    case "invalid_utf8":
      return { state: content.state, size: content.size }
  }
}

export async function readRevisionTextDiff(
  repository: Pick<RepositorySession, "readPathContent">,
  request: SpaceVersionTextContentRequest
): Promise<SpaceVersionTextContentDiff> {
  const before = request.parentId
    ? projectContentState(
        (
          await repository.readPathContent({
            revision: request.parentId,
            path: request.path,
            maxBytes: request.maxBytes,
          })
        ).content
      )
    : ({ state: "absent" } as const)
  const after = projectContentState(
    (
      await repository.readPathContent({
        revision: request.commitId,
        path: request.path,
        maxBytes: request.maxBytes,
      })
    ).content
  )
  return { path: request.path, before, after }
}
