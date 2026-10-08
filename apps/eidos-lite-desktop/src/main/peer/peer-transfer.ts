import type { PeerTransferDetail } from "../../shared/contracts"

/** Actual protocol payloads, excluding loopback export work and discovery. */
export class PeerTransferTracker {
  private readonly devices = new Map<string, PeerTransferDetail>()
  begin(id: string, name: string, stage: PeerTransferDetail["stage"]) {
    const value: PeerTransferDetail = this.devices.get(id) ?? {
      id,
      name,
      stage,
      receivedBytes: 0,
      sentBytes: 0,
      activeRequests: 0,
      updatedAt: Date.now(),
    }
    value.name = name
    value.stage = stage
    if (!value.activeRequests) value.error = undefined
    value.activeRequests += 1
    this.devices.set(id, value)
    let finished = false
    return {
      received: (bytes: number) => {
        value.receivedBytes += bytes
      },
      sent: (bytes: number) => {
        value.sentBytes += bytes
      },
      fail: (error: string) => {
        value.error = error
      },
      finish: (error?: string) => {
        if (finished) return
        finished = true
        value.activeRequests -= 1
        value.updatedAt = Date.now()
        if (error && !value.error) value.error = error
      },
    }
  }
  snapshot(): PeerTransferDetail[] {
    return [...this.devices.values()].map((value) => ({ ...value }))
  }
}
