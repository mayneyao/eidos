import { Injectable, Inject } from "../../common/di"
import {
  actionableGraftRemoteError,
  graftRemoteHttpStatus,
  OfficialGraftRemoteService,
} from "../sync/official-graft-remote"
import { GraftCliProcessRunner } from "./graft-cli-runner"
import type { GraftCliRunOptions } from "./graft-cli-process"

/**
 * Runs every repository operation through Graft v0.8's CLI control plane.
 * The SQLite extension is an optional VFS data plane and is never used as a
 * transport for repository commands.
 */
@Injectable()
export class GraftRunner {
  constructor(
    @Inject(GraftCliProcessRunner)
    private readonly processRunner: GraftCliProcessRunner,
    @Inject(OfficialGraftRemoteService)
    private readonly officialRemote: OfficialGraftRemoteService
  ) {}

  runJson(
    repositoryPath: string,
    args: readonly string[],
    options: GraftCliRunOptions = {}
  ): Promise<unknown> {
    return this.processRunner.runJson(repositoryPath, args, options)
  }

  async runRemoteJson(
    repositoryPath: string,
    args: readonly string[],
    options: GraftCliRunOptions = {}
  ): Promise<unknown> {
    const token = await this.officialRemote.getAccessToken()
    try {
      return await this.processRunner.runJson(repositoryPath, args, {
        ...options,
        remoteToken: token,
      })
    } catch (error) {
      if (graftRemoteHttpStatus(error) !== 401) {
        throw actionableGraftRemoteError(error)
      }
      const refreshedToken = await this.officialRemote.refreshAccessToken()
      try {
        return await this.processRunner.runJson(repositoryPath, args, {
          ...options,
          remoteToken: refreshedToken,
        })
      } catch (retryError) {
        throw actionableGraftRemoteError(retryError)
      }
    }
  }
}
