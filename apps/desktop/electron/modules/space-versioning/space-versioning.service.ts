import { IpcServiceBase } from "@eidos.space/electron-ipc"

import { IpcInjectable, Inject } from "../../common/di"
import { SpaceVersioningCoordinator } from "./space-versioning.coordinator"
import type {
  SpaceVersionCommit,
  SpaceVersionCommitOptions,
  SpaceVersionCommitResult,
  SpaceVersionDiff,
  SpaceVersionDiffOptions,
  SpaceVersionHistoryOptions,
  SpaceVersionHistoryResult,
  SpaceVersionStatus,
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
}
