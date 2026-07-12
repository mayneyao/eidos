import { IpcServiceBase } from "@eidos.space/electron-ipc"

import { IpcInjectable, Inject } from "../../common/di"
import { MainWindowProvider } from "../space-management/main-window.provider"
import { SpaceVersioningCoordinator } from "./space-versioning.coordinator"
import type {
  SpaceVersionCommit,
  SpaceVersionCommitOptions,
  SpaceVersionCommitResult,
  SpaceVersionConfigureRemoteOptions,
  SpaceVersionConfigureRemoteResult,
  SpaceVersionConflictList,
  SpaceVersionDiscardPathOptions,
  SpaceVersionDiscardPathResult,
  SpaceVersionDiff,
  SpaceVersionDiffOptions,
  SpaceVersionHistoryOptions,
  SpaceVersionHistoryResult,
  SpaceVersionRemoteListResult,
  SpaceVersionRemoveRemoteOptions,
  SpaceVersionRemoveRemoteResult,
  SpaceVersionResolveConflictOptions,
  SpaceVersionResolveConflictResult,
  SpaceVersionRestoreOptions,
  SpaceVersionRestorePathOptions,
  SpaceVersionRestorePathResult,
  SpaceVersionRestoreResult,
  SpaceVersionStagePathOptions,
  SpaceVersionStagePathResult,
  SpaceVersionStatus,
  SpaceVersionSyncOptions,
  SpaceVersionSyncResult,
  SpaceVersionUnstagePathOptions,
  SpaceVersionUnstagePathResult,
} from "./types"

function notifySpaceFilesChanged(
  windowProvider: MainWindowProvider,
  spaceId: string,
  path = ""
): void {
  windowProvider.getWindow()?.webContents.send("space-files:changed", {
    spaceId,
    eventType: "rescan",
    path,
  })
}

@IpcInjectable("space-versioning")
export class SpaceVersioningService extends IpcServiceBase {
  constructor(
    @Inject(SpaceVersioningCoordinator)
    private readonly coordinator: SpaceVersioningCoordinator,
    @Inject(MainWindowProvider)
    private readonly windowProvider: MainWindowProvider
  ) {
    super()
  }

  getStatus(spaceId: string): Promise<SpaceVersionStatus> {
    return this.coordinator.getStatus(spaceId)
  }

  enable(spaceId: string): Promise<SpaceVersionStatus> {
    return this.coordinator.enable(spaceId)
  }

  getRemotes(spaceId: string): Promise<SpaceVersionRemoteListResult> {
    return this.coordinator.getRemotes(spaceId)
  }

  configureRemote(
    spaceId: string,
    options: SpaceVersionConfigureRemoteOptions
  ): Promise<SpaceVersionConfigureRemoteResult> {
    return this.coordinator.configureRemote(spaceId, options)
  }

  removeRemote(
    spaceId: string,
    options: SpaceVersionRemoveRemoteOptions = {}
  ): Promise<SpaceVersionRemoveRemoteResult> {
    return this.coordinator.removeRemote(spaceId, options)
  }

  fetchRemote(
    spaceId: string,
    options: SpaceVersionSyncOptions = {}
  ): Promise<SpaceVersionSyncResult> {
    return this.coordinator.fetchRemote(spaceId, options)
  }

  async pullRemote(
    spaceId: string,
    options: SpaceVersionSyncOptions = {}
  ): Promise<SpaceVersionSyncResult> {
    const result = await this.coordinator.pullRemote(spaceId, options)
    notifySpaceFilesChanged(this.windowProvider, spaceId)
    return result
  }

  pushRemote(
    spaceId: string,
    options: SpaceVersionSyncOptions = {}
  ): Promise<SpaceVersionSyncResult> {
    return this.coordinator.pushRemote(spaceId, options)
  }

  getConflicts(spaceId: string): Promise<SpaceVersionConflictList> {
    return this.coordinator.getConflicts(spaceId)
  }

  async resolveConflict(
    spaceId: string,
    options: SpaceVersionResolveConflictOptions
  ): Promise<SpaceVersionResolveConflictResult> {
    const result = await this.coordinator.resolveConflict(spaceId, options)
    notifySpaceFilesChanged(this.windowProvider, spaceId, options.path)
    return result
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

  async discardPath(
    spaceId: string,
    options: SpaceVersionDiscardPathOptions
  ): Promise<SpaceVersionDiscardPathResult> {
    const result = await this.coordinator.discardPath(spaceId, options)
    notifySpaceFilesChanged(this.windowProvider, spaceId, result.path)
    return result
  }

  async restorePath(
    spaceId: string,
    options: SpaceVersionRestorePathOptions
  ): Promise<SpaceVersionRestorePathResult> {
    const result = await this.coordinator.restorePath(spaceId, options)
    notifySpaceFilesChanged(this.windowProvider, spaceId, result.path)
    return result
  }

  async restoreVersion(
    spaceId: string,
    options: SpaceVersionRestoreOptions
  ): Promise<SpaceVersionRestoreResult> {
    const result = await this.coordinator.restoreVersion(spaceId, options)
    notifySpaceFilesChanged(this.windowProvider, spaceId)
    return result
  }
}
