import {
  computeFileDiff,
  type DiffComputationRequest,
  type DiffComputationResponse,
} from "./diff-computation"

interface DiffWorkerScope {
  onmessage: ((event: MessageEvent<DiffComputationRequest>) => void) | null
  postMessage: (message: DiffComputationResponse) => void
}

const workerScope = self as unknown as DiffWorkerScope

workerScope.onmessage = (event) => {
  try {
    workerScope.postMessage({ diff: computeFileDiff(event.data) })
  } catch (error) {
    workerScope.postMessage({
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
