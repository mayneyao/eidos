import fs from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"
import {
  ResourceGrants,
  type ResourceGrantRecord,
  type TextResourceDeclaration,
} from "@eidos.space/plugin-runtime/resource-grants"
import type { Scope } from "@eidos.space/plugin-runtime/lifecycle"
import { object, PluginError } from "@eidos.space/plugin-runtime/rpc"

interface AuthorityRecord {
  spaceId: string
  pluginId: string
  resources: ResourceGrantRecord[]
}

/** Local device state. Installation scope never supplies or inherits a grant.
 * No guest IPC is exposed until native filesystem confinement is connected.
 */
export class PluginGrantStore {
  private loaded?: Promise<void>
  private writes: Promise<void> = Promise.resolve()
  private readonly authorities = new Map<string, ResourceGrants>()

  constructor(readonly file: string) {}

  private key(spaceId: string, pluginId: string): string {
    return JSON.stringify([spaceId, pluginId])
  }

  private load(): Promise<void> {
    return (this.loaded ??= (async () => {
      let raw: string
      try {
        raw = await fs.readFile(this.file, "utf8")
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return
        throw error
      }
      const config = object(JSON.parse(raw))
      if (config.version !== 1 || !Array.isArray(config.authorities))
        throw new PluginError("INVALID_REQUEST", "Invalid resource grant store")
      const restored = new Map<string, ResourceGrants>()
      for (const rawRecord of config.authorities) {
        const record = object(rawRecord)
        if (
          typeof record.spaceId !== "string" ||
          typeof record.pluginId !== "string" ||
          !Array.isArray(record.resources)
        )
          throw new PluginError(
            "INVALID_REQUEST",
            "Invalid resource grant identity"
          )
        const key = this.key(record.spaceId, record.pluginId)
        if (restored.has(key))
          throw new PluginError(
            "INVALID_REQUEST",
            "Duplicate resource grant identity"
          )
        restored.set(
          key,
          new ResourceGrants(record.spaceId, record.pluginId, record.resources)
        )
      }
      for (const [key, authority] of restored)
        this.authorities.set(key, authority)
    })())
  }

  private authority(spaceId: string, pluginId: string): ResourceGrants {
    const key = this.key(spaceId, pluginId)
    let authority = this.authorities.get(key)
    if (!authority) {
      authority = new ResourceGrants(spaceId, pluginId)
      this.authorities.set(key, authority)
    }
    return authority
  }

  private change(
    spaceId: string,
    pluginId: string,
    mutation: (authority: ResourceGrants) => void
  ): Promise<void> {
    const write = this.writes.then(async () => {
      await this.load()
      const current = this.authority(spaceId, pluginId)
      const candidate = new ResourceGrants(
        spaceId,
        pluginId,
        current.snapshot()
      )
      mutation(candidate)
      const authorities: AuthorityRecord[] = [...this.authorities.values()].map(
        (item) => ({
          spaceId: item.spaceId,
          pluginId: item.pluginId,
          resources: item === current ? candidate.snapshot() : item.snapshot(),
        })
      )
      await fs.mkdir(path.dirname(this.file), { recursive: true })
      const temporary = `${this.file}.${randomUUID()}.tmp`
      try {
        const handle = await fs.open(temporary, "wx", 0o600)
        try {
          await handle.writeFile(JSON.stringify({ version: 1, authorities }))
          await handle.sync()
        } finally {
          await handle.close()
        }
        await fs.rename(temporary, this.file)
        // Invalidate existing handles only after the new grant was persisted.
        mutation(current)
      } finally {
        await fs.rm(temporary, { force: true })
      }
    })
    this.writes = write.catch(() => {})
    return write
  }

  /** Called only after the host has reviewed the selected target and ceiling. */
  bind(
    spaceId: string,
    pluginId: string,
    id: string,
    target: string,
    ceiling: TextResourceDeclaration
  ): Promise<void> {
    const snapshot = structuredClone(ceiling)
    return this.change(spaceId, pluginId, (authority) => {
      authority.bind(id, target, snapshot)
    })
  }

  revoke(spaceId: string, pluginId: string, id: string): Promise<void> {
    return this.change(spaceId, pluginId, (authority) => authority.revoke(id))
  }

  async revokePlugin(pluginId: string): Promise<void> {
    await this.writes
    await this.load()
    for (const authority of this.authorities.values()) {
      if (authority.pluginId !== pluginId) continue
      await this.change(authority.spaceId, pluginId, (current) => {
        for (const record of current.snapshot())
          if (record.binding) current.revoke(record.id)
      })
    }
  }

  /** The caller supplies the active revision's declaration, never guest input. */
  async acquire(
    spaceId: string,
    pluginId: string,
    id: string,
    requested: TextResourceDeclaration,
    lifetime: Scope
  ) {
    const snapshot = structuredClone(requested)
    await this.writes
    await this.load()
    return this.authority(spaceId, pluginId).acquire(id, snapshot, lifetime)
  }
}
