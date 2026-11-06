import { randomUUID } from "node:crypto"
import { IPC_CHANNELS } from "../../shared/contracts"

interface Owner {
  id: number
  isDestroyed(): boolean
  send(channel: string, ...args: unknown[]): void
}

/** A renderer must acknowledge its draft check and input fence before disk replacement. */
export class AutomaticMaterializationCoordinator {
  private readonly pending = new Map<
    number,
    {
      token: string
      reply(allowed: boolean): void
    }
  >()

  async prepare(
    owner: Owner,
    spaceId: string,
    signal: AbortSignal
  ): Promise<() => void> {
    signal.throwIfAborted()
    if (owner.isDestroyed() || this.pending.has(owner.id))
      throw new DOMException("Editor is unavailable", "AbortError")
    const token = randomUUID()
    const release = () => {
      if (this.pending.get(owner.id)?.token !== token) return
      this.pending.delete(owner.id)
      if (!owner.isDestroyed())
        owner.send(IPC_CHANNELS.syncReleaseMaterialization, token)
    }
    let allowed = false
    try {
      allowed = await new Promise<boolean>((resolve) => {
        const finish = (value: boolean) => {
          clearTimeout(timeout)
          signal.removeEventListener("abort", abort)
          resolve(value)
        }
        const abort = () => finish(false)
        const timeout = setTimeout(abort, 5_000)
        this.pending.set(owner.id, { token, reply: finish })
        signal.addEventListener("abort", abort, { once: true })
        owner.send(IPC_CHANNELS.syncPrepareMaterialization, token, spaceId)
      })
      signal.throwIfAborted()
      if (!allowed)
        throw new DOMException(
          "Waiting for unsubmitted Eidos File edits",
          "AbortError"
        )
      return release
    } catch (error) {
      release()
      throw error
    }
  }

  reply(ownerId: number, token: unknown, allowed: unknown): void {
    const pending = this.pending.get(ownerId)
    if (pending && pending.token === token) pending.reply(allowed === true)
  }
}
