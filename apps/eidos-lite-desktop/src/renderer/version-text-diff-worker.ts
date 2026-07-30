import {
  computeVersionTextDiff,
  type VersionTextDiffComputationRequest,
  type VersionTextDiffComputationResponse,
} from "./version-text-diff-computation"

interface DiffWorkerScope {
  onmessage:
    | ((event: MessageEvent<VersionTextDiffComputationRequest>) => void)
    | null
  postMessage(message: VersionTextDiffComputationResponse): void
}

const workerScope = self as unknown as DiffWorkerScope

workerScope.onmessage = (event) => {
  try {
    workerScope.postMessage({ diff: computeVersionTextDiff(event.data) })
  } catch (error) {
    workerScope.postMessage({
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
