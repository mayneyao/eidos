import fs from "node:fs"
import path from "node:path"

import { IpcServiceBase } from "@eidos.space/electron-ipc"

import { Inject, IpcInjectable } from "../../common/di"
import { DataSpaceManager } from "../data-space"
import { SpaceRegistry } from "../space-management/space-registry"
import { GraftRunner } from "../space-versioning/graft-runner"
import { CredentialsManager } from "./credentials"
import {
  EidosSyncError,
  OfficialGraftRemoteService,
  type OfficialGraftRepository,
} from "./official-graft-remote"

interface CloneSpaceParams {
  localPath: string
  repository: string
  spaceName?: string
  mode?: "file" | "legacy"
}

@IpcInjectable("sync")
export class SyncService extends IpcServiceBase {
  constructor(
    @Inject(CredentialsManager) private credentials: CredentialsManager,
    @Inject(OfficialGraftRemoteService)
    private officialRemote: OfficialGraftRemoteService,
    @Inject(SpaceRegistry) private registry: SpaceRegistry,
    @Inject(DataSpaceManager) private dataSpaceManager: DataSpaceManager,
    @Inject(GraftRunner) private graftRunner: GraftRunner
  ) {
    super()
  }

  async getOfficialSyncStatus() {
    const [discovery, repositories] = await Promise.all([
      this.officialRemote.discover(),
      this.officialRemote.listRepositories(),
    ])
    return { discovery, ...repositories }
  }

  async provisionRepository(repository: string) {
    return this.officialRemote.provisionRepository(repository)
  }

  async listRemoteSpaces(): Promise<{
    success: boolean
    repositories?: OfficialGraftRepository[]
    namespace?: string
    error?: string
  }> {
    try {
      const result = await this.officialRemote.listRepositories()
      return { success: true, ...result }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  async cloneSpace(params: CloneSpaceParams): Promise<{
    success: boolean
    space?: unknown
    existingSpace?: unknown
    pathConflictType?: string
    message?: string
    error?: string
  }> {
    let registeredSpaceId: string | undefined
    let shouldCleanupEidosDir = false
    let cloneStagingPath: string | undefined
    try {
      const { localPath, repository, spaceName, mode = "file" } = params
      const listed = await this.officialRemote.listRepositories()
      const remote = listed.repositories.find(
        (entry) => entry.name === repository
      )
      if (!remote) {
        throw new EidosSyncError(
          "The Eidos Sync repository was not found. Refresh the repository list and try again.",
          404
        )
      }

      if (!fs.existsSync(localPath) || !fs.statSync(localPath).isDirectory()) {
        throw new Error("Choose an existing local folder for the cloned Space.")
      }
      if (mode === "file" && fs.readdirSync(localPath).length > 0) {
        throw new Error(
          "File Space clones require an empty folder. Choose or create an empty folder and try again."
        )
      }

      shouldCleanupEidosDir =
        mode === "legacy" && !fs.existsSync(path.join(localPath, ".eidos"))
      const space = this.registry.registerSpace(localPath, {
        customName: spaceName || repository,
        remoteUrl: remote.remoteUrl,
        provider: "eidos.space",
        mode,
      })
      registeredSpaceId = space.id

      if (mode === "file") {
        cloneStagingPath = fs.mkdtempSync(
          path.join(path.dirname(path.resolve(localPath)), ".eidos-file-clone-")
        )
        await this.graftRunner.runRemoteJson(cloneStagingPath, [
          "clone",
          "--json",
          remote.remoteUrl,
        ])

        if (fs.readdirSync(localPath).length > 0) {
          throw new Error(
            "The selected folder changed while cloning. Its existing files were preserved; choose an empty folder and try again."
          )
        }
        fs.rmdirSync(localPath)
        fs.renameSync(cloneStagingPath, localPath)
        cloneStagingPath = undefined
      } else {
        await this.dataSpaceManager.getOrSetDataSpace(space.id, {
          enabled: true,
          remote: remote.remoteUrl,
          requireRemoteClone: true,
        })
      }

      return { success: true, space, message: "Space cloned successfully" }
    } catch (error) {
      if (cloneStagingPath) {
        try {
          fs.rmSync(cloneStagingPath, { recursive: true, force: true })
        } catch {
          // The staging directory is outside the selected folder; cleanup is best effort.
        }
      }
      if (registeredSpaceId) {
        this.registry.removeSpace(registeredSpaceId)
        if (shouldCleanupEidosDir) {
          try {
            fs.rmSync(path.join(params.localPath, ".eidos"), {
              recursive: true,
              force: true,
            })
          } catch {
            // The failed clone is already unregistered; leave user files intact.
          }
        }
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        existingSpace: (error as { existingSpace?: unknown })?.existingSpace,
        pathConflictType: (error as { pathConflictType?: string })
          ?.pathConflictType,
      }
    }
  }

  async setSecret(key: string, value: string): Promise<void> {
    return this.credentials.setSecret(key, value)
  }

  async getSecret(key: string): Promise<string | null> {
    return this.credentials.getSecret(key)
  }

  async listSecrets(): Promise<Record<string, string>> {
    return this.credentials.listSecrets()
  }

  async deleteSecret(key: string): Promise<void> {
    return this.credentials.deleteSecret(key)
  }
}
