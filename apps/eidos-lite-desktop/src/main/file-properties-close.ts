import { randomUUID } from "node:crypto"
import type { WebContents } from "electron"

import { IPC_CHANNELS } from "../shared/contracts"

/**
 * Lets the properties renderer flush a focused draft before the native window
 * closes. A renderer that never answers is allowed to close after the timeout
 * so a failed inspector cannot trap the window forever.
 */
export class FilePropertiesCloseCoordinator {
  private readonly pending = new Map<
    number,
    {
      token: string
      promise: Promise<boolean>
      finish(allowed: boolean): void
    }
  >()

  prepare(owner: WebContents, timeoutMs = 15_000): Promise<boolean> {
    if (owner.isDestroyed()) return Promise.resolve(true)
    const existing = this.pending.get(owner.id)
    if (existing) return existing.promise
    const token = randomUUID()
    let finish!: (allowed: boolean) => void
    const promise = new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => finish(true), timeoutMs)
      timeout.unref?.()
      finish = (allowed) => {
        clearTimeout(timeout)
        this.pending.delete(owner.id)
        resolve(allowed)
      }
    })
    this.pending.set(owner.id, { token, promise, finish })
    try {
      owner.send(IPC_CHANNELS.filePropertiesPrepareClose, token)
    } catch {
      finish(true)
    }
    return promise
  }

  reply(ownerId: number, token: unknown, allowed: unknown): void {
    const request = this.pending.get(ownerId)
    if (request && request.token === token) request.finish(allowed === true)
  }

  cancel(owner: WebContents): void {
    this.pending.get(owner.id)?.finish(true)
  }
}
