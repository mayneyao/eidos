import { randomUUID } from "node:crypto"
import { IPC_CHANNELS } from "../shared/contracts"

interface DraftOwner {
  id: number
  isDestroyed(): boolean
  send(channel: string, ...args: unknown[]): void
}

/** Correlate replies with both the originating window and a single close attempt. */
export class TextDraftCloseCoordinator {
  private readonly pending = new Map<
    number,
    {
      token: string
      promise: Promise<boolean>
      finish: (allowed: boolean) => void
    }
  >()

  prepare(owner: DraftOwner): Promise<boolean> {
    if (owner.isDestroyed()) return Promise.resolve(false)
    const existing = this.pending.get(owner.id)
    if (existing) return existing.promise
    const token = randomUUID()
    let finish!: (allowed: boolean) => void
    const promise = new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => finish(false), 10 * 60_000)
      finish = (allowed) => {
        clearTimeout(timeout)
        this.pending.delete(owner.id)
        resolve(allowed)
      }
    })
    this.pending.set(owner.id, { token, promise, finish })
    try {
      owner.send(IPC_CHANNELS.textDraftPrepareClose, token)
    } catch {
      finish(false)
    }
    return promise
  }

  reply(ownerId: number, token: unknown, allowed: unknown): void {
    const request = this.pending.get(ownerId)
    if (request && request.token === token) request.finish(allowed === true)
  }

  cancel(owner: DraftOwner): void {
    this.pending.get(owner.id)?.finish(false)
    try {
      if (!owner.isDestroyed()) owner.send(IPC_CHANNELS.textDraftReleaseClose)
    } catch {
      // A window can disappear between the liveness check and the send.
    }
  }
}
