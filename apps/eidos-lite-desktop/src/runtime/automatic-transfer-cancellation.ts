import type { GraftSdkWorkerRequest } from "../shared/graft-sdk-contracts"

const TRANSFERS = new Set(["fetch", "fetchForCheckout", "push"])
export const AUTOMATIC_TRANSFER_CANCEL_GRACE_MS = 250

/** This runs in the Graft utility, beside the actual command admission boundary. */
export class AutomaticTransferCancellation {
  private readonly active = new Map<number, GraftSdkWorkerRequest>()
  private retiring: number | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private committed = false

  constructor(private readonly exit: (requestId: number) => void) {}

  start(request: Exclude<GraftSdkWorkerRequest, { type: "cancel" }>): void {
    if (this.retiring !== null) {
      throw new DOMException(
        "Automatic transfer is cancelling; retry after its session closes",
        "AbortError"
      )
    }
    if (
      request.type === "command" &&
      request.automaticTransfer &&
      !TRANSFERS.has(request.command)
    )
      throw new Error(
        "Automatic transfer cancellation requires a network-only command"
      )
    this.active.set(request.requestId, request)
  }

  cancel(requestId: number): void {
    const request = this.active.get(requestId)
    if (
      this.retiring !== null ||
      request?.type !== "command" ||
      !request.automaticTransfer ||
      !TRANSFERS.has(request.command)
    )
      return
    // Seal admission before scheduling exit. A stale cancel cannot retire a
    // newer apply, and no apply can race in during the grace period.
    this.retiring = requestId
    this.timer = setTimeout(
      () => this.maybeExit(),
      AUTOMATIC_TRANSFER_CANCEL_GRACE_MS
    )
  }

  finish(requestId: number): void {
    this.active.delete(requestId)
    if (this.retiring === requestId && !this.committed) {
      this.retiring = null
      if (this.timer) clearTimeout(this.timer)
      this.timer = null
    } else if (this.retiring !== null && !this.timer) {
      this.maybeExit()
    }
  }

  private maybeExit(): void {
    this.timer = null
    const request =
      this.retiring === null ? undefined : this.active.get(this.retiring)
    // Recheck the entire active set at the time of exit. Existing mutations
    // and session transitions must finish; they are never interrupted.
    if (
      request?.type === "command" &&
      request.automaticTransfer &&
      TRANSFERS.has(request.command) &&
      this.active.size === 1 &&
      !this.committed
    ) {
      this.committed = true
      this.exit(request.requestId)
    }
  }
}
