import { IpcServiceBase } from "@eidos.space/electron-ipc"

import { IpcInjectable, Inject } from "../../common/di"
import { SpaceVersioningCoordinator } from "./space-versioning.coordinator"
import type {
  SpaceVersionCommit,
  SpaceVersionCommitOptions,
  SpaceVersionCommitResult,
  SpaceVersionDiscardPathOptions,
  SpaceVersionDiscardPathResult,
  SpaceVersionDiff,
  SpaceVersionDiffOptions,
  SpaceVersionHistoryOptions,
  SpaceVersionHistoryResult,
  SpaceVersionRestoreOptions,
  SpaceVersionRestorePathOptions,
  SpaceVersionRestorePathResult,
  SpaceVersionRestoreResult,
  SpaceVersionStagePathOptions,
  SpaceVersionStagePathResult,
  SpaceVersionStatus,
  SpaceVersionUnstagePathOptions,
  SpaceVersionUnstagePathResult,
} from "./types"

@IpcInjectable("space-versioning")
export class SpaceVersioningService extends IpcServiceBase {
  constructor(
    @Inject(SpaceVersioningCoordinator)
    private readonly coordinator: SpaceVersioningCoordinator
  ) {
    super()
  }

  getStatus(spaceId: string): Promise<SpaceVersionStatus> {
    return this.coordinator.getStatus(spaceId)
  }

  enable(spaceId: string): Promise<SpaceVersionStatus> {
    return this.coordinator.enable(spaceId)
  }

  commit(
    spaceId: string,
    options: SpaceVersionCommitOptions
  ): Promise<SpaceVersionCommitResult> {
    return this.coordinator.commit(spaceId, options)
  }

  getHistory(
    spaceId: string,
    options: SpaceVersionHistoryOptions = {}
  ): Promise<SpaceVersionHistoryResult> {
    return this.coordinator.getHistory(spaceId, options)
  }

  getCommit(spaceId: string, commitId: string): Promise<SpaceVersionCommit> {
    return this.coordinator.getCommit(spaceId, commitId)
  }

  getDiff(
    spaceId: string,
    options: SpaceVersionDiffOptions
  ): Promise<SpaceVersionDiff> {
    return this.coordinator.getDiff(spaceId, options)
  }

  stagePath(
    spaceId: string,
    options: SpaceVersionStagePathOptions
  ): Promise<SpaceVersionStagePathResult> {
    return this.coordinator.stagePath(spaceId, options)
  }

  unstagePath(
    spaceId: string,
    options: SpaceVersionUnstagePathOptions
  ): Promise<SpaceVersionUnstagePathResult> {
    return this.coordinator.unstagePath(spaceId, options)
  }

  discardPath(
    spaceId: string,
    options: SpaceVersionDiscardPathOptions
  ): Promise<SpaceVersionDiscardPathResult> {
    return this.coordinator.discardPath(spaceId, options)
  }

  restorePath(
    spaceId: string,
    options: SpaceVersionRestorePathOptions
  ): Promise<SpaceVersionRestorePathResult> {
    return this.coordinator.restorePath(spaceId, options)
  }

  restoreVersion(
    spaceId: string,
    options: SpaceVersionRestoreOptions
  ): Promise<SpaceVersionRestoreResult> {
    return this.coordinator.restoreVersion(spaceId, options)
  }
}
