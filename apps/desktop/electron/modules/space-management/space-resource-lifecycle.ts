import path from "node:path"

import { Injectable } from "../../common/di"

type ResourceDisposer = (spacePath: string) => Promise<void> | void
type ResourceCleanup = () => Promise<void> | void

interface ResourceOwner {
  dispose: ResourceDisposer
  cleanup: ResourceCleanup
}

@Injectable()
export class SpaceResourceLifecycle {
  private readonly owners = new Map<string, ResourceOwner>()

  register(
    owner: string,
    dispose: ResourceDisposer,
    cleanup: ResourceCleanup
  ): void {
    if (this.owners.has(owner)) {
      throw new Error(`Space resource owner is already registered: ${owner}`)
    }
    this.owners.set(owner, { dispose, cleanup })
  }

  async release(spacePath: string): Promise<void> {
    const canonicalPath = path.resolve(spacePath)
    await Promise.all(
      [...this.owners.values()].map(({ dispose }) => dispose(canonicalPath))
    )
  }

  async releaseAll(): Promise<void> {
    await Promise.all([...this.owners.values()].map(({ cleanup }) => cleanup()))
  }
}
