import type { EidosSyncMergeFailure } from "../../shared/contracts"

export function classifyMergeFailure(error: unknown): EidosSyncMergeFailure {
  const code =
    error instanceof Error && "code" in error && typeof error.code === "string"
      ? error.code
      : undefined
  if (code === "GRAFT_SDK_REPOSITORY_STALE") {
    return {
      code: "stale",
      title: "Merge changed",
      message:
        "Another merge step changed this state. Reload the latest analysis before continuing.",
      localSafe: true,
      retryable: true,
    }
  }
  if (error instanceof Error && error.name === "AbortError") {
    return {
      code: "cancelled",
      title: "Merge step cancelled",
      message:
        "Eidos finished the safety checks. Reopen the merge to see its durable state.",
      localSafe: true,
      retryable: true,
    }
  }
  if (code === "EIDOS_LITE_GRAFT_MERGE_UNAVAILABLE") {
    return {
      code: "unavailable",
      title: "Merge SDK unavailable",
      message:
        "The installed Graft SDK does not provide the merge operation required by this Eidos Lite build. Local and Hosted history remain unchanged.",
      localSafe: true,
      retryable: false,
    }
  }
  const message = error instanceof Error ? error.message.toLowerCase() : ""
  if (
    message.includes("checkpoint") ||
    message.includes("diverged") ||
    message.includes("merge") ||
    message.includes("unmerged")
  ) {
    return {
      code: "invalid-state",
      title: "Merge needs a fresh analysis",
      message:
        "The repository no longer matches this merge step. Refresh Sync and analyze both histories again.",
      localSafe: true,
      retryable: true,
    }
  }
  return {
    code: "unknown",
    title: "Merge step did not finish",
    message:
      "Local and Hosted versions are still preserved. Reopen the merge or use the two-copy recovery path.",
    localSafe: true,
    retryable: true,
  }
}
