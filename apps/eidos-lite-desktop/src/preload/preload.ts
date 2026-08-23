import { contextBridge, ipcRenderer, webUtils } from "electron"

import {
  IPC_CHANNELS,
  type EidosLiteApi,
  type EidosLiteAssetDataSource,
  type EidosLiteNavigationDirection,
  type EidosLitePreferences,
  type EidosLiteUpdateStatus,
  type EidosPublishProgress,
  type EidosSyncProgress,
  type EidosSyncQueueStatus,
  type RuntimeCalls,
  type RuntimeMethod,
  type SpaceSnapshot,
} from "../shared/contracts"
import type { EidosLiteShortcutCommand } from "../shared/keyboard-shortcuts"
import type { FileEntry } from "@eidos.space/eidos-file"

const api: EidosLiteApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC_CHANNELS.appInfo),
  getPreferences: () => ipcRenderer.invoke(IPC_CHANNELS.preferencesGet),
  updatePreferences: (patch) =>
    ipcRenderer.invoke(IPC_CHANNELS.preferencesUpdate, patch),
  chooseDefaultSpaceLocation: () =>
    ipcRenderer.invoke(IPC_CHANNELS.preferencesChooseSpaceLocation),
  onPreferencesChanged: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      preferences: EidosLitePreferences
    ) => listener(preferences)
    ipcRenderer.on(IPC_CHANNELS.preferencesChanged, handler)
    return () =>
      ipcRenderer.removeListener(IPC_CHANNELS.preferencesChanged, handler)
  },
  getUpdateStatus: () => ipcRenderer.invoke(IPC_CHANNELS.updateStatus),
  onUpdateStatusChanged: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      status: EidosLiteUpdateStatus
    ) => listener(status)
    ipcRenderer.on(IPC_CHANNELS.updateChanged, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.updateChanged, handler)
  },
  checkForUpdates: () => ipcRenderer.invoke(IPC_CHANNELS.updateCheck),
  downloadUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.updateDownload),
  restartToInstallUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.updateInstall),
  openSettings: () => ipcRenderer.invoke(IPC_CHANNELS.settingsOpen),
  openSettingsDestination: (destination) =>
    ipcRenderer.invoke(IPC_CHANNELS.settingsOpenDestination, destination),
  getDiagnostics: () => ipcRenderer.invoke(IPC_CHANNELS.diagnostics),
  copyDiagnostics: () => ipcRenderer.invoke(IPC_CHANNELS.copyDiagnostics),
  readClipboardText: () => ipcRenderer.invoke(IPC_CHANNELS.clipboardReadText),
  openExternalUrl: (uri) =>
    ipcRenderer.invoke(IPC_CHANNELS.openExternalUrl, uri),
  openSpace: () => ipcRenderer.invoke(IPC_CHANNELS.openSpace),
  newSpace: () => ipcRenderer.invoke(IPC_CHANNELS.newSpace),
  listRecentSpaces: () => ipcRenderer.invoke(IPC_CHANNELS.recentSpaces),
  openRecentSpace: (id) => ipcRenderer.invoke(IPC_CHANNELS.openRecentSpace, id),
  removeRecentSpace: (id) =>
    ipcRenderer.invoke(IPC_CHANNELS.removeRecentSpace, id),
  getSpace: () => ipcRenderer.invoke(IPC_CHANNELS.getSpace),
  refreshSpace: () => ipcRenderer.invoke(IPC_CHANNELS.refreshSpace),
  refreshExplorer: () => ipcRenderer.invoke(IPC_CHANNELS.refreshExplorer),
  loadSpaceDirectory: (relativePath) =>
    ipcRenderer.invoke(IPC_CHANNELS.loadSpaceDirectory, relativePath),
  searchSpacePaths: (query, limit) =>
    ipcRenderer.invoke(IPC_CHANNELS.searchPaths, query, limit),
  onSpaceChanged: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, value: SpaceSnapshot) =>
      listener(value)
    ipcRenderer.on(IPC_CHANNELS.spaceChanged, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.spaceChanged, handler)
  },
  onNavigationCommand: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      direction: EidosLiteNavigationDirection
    ) => listener(direction)
    ipcRenderer.on(IPC_CHANNELS.navigationCommand, handler)
    return () =>
      ipcRenderer.removeListener(IPC_CHANNELS.navigationCommand, handler)
  },
  onWorkspaceShortcutCommand: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      command: EidosLiteShortcutCommand
    ) => listener(command)
    ipcRenderer.on(IPC_CHANNELS.workspaceShortcutCommand, handler)
    return () =>
      ipcRenderer.removeListener(IPC_CHANNELS.workspaceShortcutCommand, handler)
  },
  takeLaunchEidosFile: () => ipcRenderer.invoke(IPC_CHANNELS.takeLaunchFile),
  onLaunchEidosFileAvailable: (listener) => {
    const handler = () => listener()
    ipcRenderer.on(IPC_CHANNELS.launchFileAvailable, handler)
    return () =>
      ipcRenderer.removeListener(IPC_CHANNELS.launchFileAvailable, handler)
  },
  openEidosFile: (relativePath) =>
    ipcRenderer.invoke(IPC_CHANNELS.openFile, relativePath),
  previewTextFile: (relativePath) =>
    ipcRenderer.invoke(IPC_CHANNELS.previewTextFile, relativePath),
  openHtmlPreview: (request) =>
    ipcRenderer.invoke(IPC_CHANNELS.htmlPreviewOpen, request),
  layoutHtmlPreview: (request) =>
    ipcRenderer.invoke(IPC_CHANNELS.htmlPreviewLayout, request),
  reloadHtmlPreview: (previewId) =>
    ipcRenderer.invoke(IPC_CHANNELS.htmlPreviewReload, previewId),
  closeHtmlPreview: (previewId) =>
    ipcRenderer.invoke(IPC_CHANNELS.htmlPreviewClose, previewId),
  saveTextFile: (request) =>
    ipcRenderer.invoke(IPC_CHANNELS.saveTextFile, request),
  inspectEidosFileIssue: (relativePath) =>
    ipcRenderer.invoke(IPC_CHANNELS.inspectFileIssue, relativePath),
  closeEidosFile: (sessionId) =>
    ipcRenderer.invoke(IPC_CHANNELS.closeFile, sessionId),
  createEidosFile: (parentRelativePath, name) =>
    ipcRenderer.invoke(IPC_CHANNELS.createEidosFile, parentRelativePath, name),
  createTextFile: (parentRelativePath, name) =>
    ipcRenderer.invoke(IPC_CHANNELS.createTextFile, parentRelativePath, name),
  createFolder: (parentRelativePath, name) =>
    ipcRenderer.invoke(IPC_CHANNELS.createFolder, parentRelativePath, name),
  renamePath: (relativePath, name) =>
    ipcRenderer.invoke(IPC_CHANNELS.renamePath, relativePath, name),
  movePath: (relativePath, targetDirectory) =>
    ipcRenderer.invoke(IPC_CHANNELS.movePath, relativePath, targetDirectory),
  copyPath: (relativePath, targetDirectory) =>
    ipcRenderer.invoke(IPC_CHANNELS.copyPath, relativePath, targetDirectory),
  deletePath: (relativePath) =>
    ipcRenderer.invoke(IPC_CHANNELS.deletePath, relativePath),
  importFiles: (targetDirectory) =>
    ipcRenderer.invoke(IPC_CHANNELS.importFiles, targetDirectory),
  selectEidosFileAssets: (sessionId) =>
    ipcRenderer.invoke(IPC_CHANNELS.selectEidosFileAssets, sessionId),
  importDroppedEidosFileAssets: async (sessionId, files) => {
    if (files.length === 0) return []
    const importedByIndex: (FileEntry | null)[] = files.map(() => null)
    const sourcePaths: string[] = []
    const pathIndexes: number[] = []
    const dataSources: EidosLiteAssetDataSource[] = []
    const dataIndexes: number[] = []
    for (const [index, file] of files.entries()) {
      const sourcePath = webUtils.getPathForFile(file)
      if (sourcePath) {
        pathIndexes.push(index)
        sourcePaths.push(sourcePath)
      } else {
        dataIndexes.push(index)
        dataSources.push({
          name: file.name,
          data: new Uint8Array(await file.arrayBuffer()),
        })
      }
    }
    const [pathEntries, dataEntries] = await Promise.all([
      sourcePaths.length > 0
        ? ipcRenderer.invoke(
            IPC_CHANNELS.importEidosFileAssets,
            sessionId,
            sourcePaths
          )
        : Promise.resolve<FileEntry[]>([]),
      dataSources.length > 0
        ? ipcRenderer.invoke(
            IPC_CHANNELS.importEidosFileAssetData,
            sessionId,
            dataSources
          )
        : Promise.resolve<FileEntry[]>([]),
    ])
    pathIndexes.forEach((fileIndex, position) => {
      importedByIndex[fileIndex] = pathEntries[position] ?? null
    })
    dataIndexes.forEach((fileIndex, position) => {
      importedByIndex[fileIndex] = dataEntries[position] ?? null
    })
    return importedByIndex.filter((entry): entry is FileEntry => entry !== null)
  },
  acquireRemoteEidosFileAsset: (sessionId, uri, name) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.acquireRemoteEidosFileAsset,
      sessionId,
      uri,
      name
    ),
  resolveEidosFileAsset: (sessionId, entryId, purpose) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.resolveEidosFileAsset,
      sessionId,
      entryId,
      purpose
    ),
  resolveEidosFileUrlImage: (sessionId, uri, purpose) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.resolveEidosFileUrlImage,
      sessionId,
      uri,
      purpose
    ),
  releaseEidosFileAsset: (sessionId, leaseId) =>
    ipcRenderer.invoke(IPC_CHANNELS.releaseEidosFileAsset, sessionId, leaseId),
  activateEidosFileAsset: (sessionId, leaseId, action) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.activateEidosFileAsset,
      sessionId,
      leaseId,
      action
    ),
  selectCsvFile: () => ipcRenderer.invoke(IPC_CHANNELS.selectCsv),
  releaseCsvFile: (token) => ipcRenderer.invoke(IPC_CHANNELS.releaseCsv, token),
  saveCsvFile: (suggestedName, bytes) =>
    ipcRenderer.invoke(IPC_CHANNELS.saveCsv, suggestedName, bytes),
  callRuntime: <M extends RuntimeMethod>(
    sessionId: string,
    method: M,
    args: RuntimeCalls[M]["args"]
  ) => ipcRenderer.invoke(IPC_CHANNELS.runtimeCall, sessionId, method, args),
  enableVersioning: () => ipcRenderer.invoke(IPC_CHANNELS.enableVersioning),
  createCheckpoint: (message) =>
    ipcRenderer.invoke(IPC_CHANNELS.createCheckpoint, message),
  getVersionChanges: (limit, after) =>
    ipcRenderer.invoke(IPC_CHANNELS.versionChanges, limit, after),
  getVersionHistory: (limit, after) =>
    ipcRenderer.invoke(IPC_CHANNELS.versionHistory, limit, after),
  getVersionDiff: (commitId, parentId, limit, after) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.versionDiff,
      commitId,
      parentId,
      limit,
      after
    ),
  getVersionPathDiff: (relativePath, commitId, parentId, tableName, rowAfter) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.versionPathDiff,
      relativePath,
      commitId,
      parentId,
      tableName,
      rowAfter
    ),
  cancelVersionReads: () => ipcRenderer.invoke(IPC_CHANNELS.versionCancel),
  getTrackedIgnoredPaths: (limit, after) =>
    ipcRenderer.invoke(IPC_CHANNELS.trackedIgnoredPaths, limit, after),
  untrackIgnoredPaths: (expectedHead) =>
    ipcRenderer.invoke(IPC_CHANNELS.untrackIgnoredPaths, expectedHead),
  getVersionTextDiff: (commitId, parentId, relativePath, previousPath) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.versionTextDiff,
      commitId,
      parentId,
      relativePath,
      previousPath
    ),
  getWorkingTextDiff: (expectedHead, relativePath, previousPath) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.versionWorkingTextDiff,
      expectedHead,
      relativePath,
      previousPath
    ),
  discardWorkingChanges: (request) =>
    ipcRenderer.invoke(IPC_CHANNELS.discardWorkingChanges, request),
  restoreCheckpoint: (commitId, expectedHead) =>
    ipcRenderer.invoke(IPC_CHANNELS.restoreCheckpoint, commitId, expectedHead),
  getSyncStatus: () => ipcRenderer.invoke(IPC_CHANNELS.syncStatus),
  beginSyncSignIn: () => ipcRenderer.invoke(IPC_CHANNELS.syncSignIn),
  signOutSync: () => ipcRenderer.invoke(IPC_CHANNELS.syncSignOut),
  getSyncPreflight: () => ipcRenderer.invoke(IPC_CHANNELS.syncPreflight),
  enableSync: (approval) =>
    ipcRenderer.invoke(IPC_CHANNELS.syncEnable, approval),
  listSyncRepositories: () => ipcRenderer.invoke(IPC_CHANNELS.syncRepositories),
  cloneSyncRepository: (remoteUrl, displayName) =>
    ipcRenderer.invoke(IPC_CHANNELS.syncClone, remoteUrl, displayName),
  runSync: () => ipcRenderer.invoke(IPC_CHANNELS.syncRun),
  onSyncProgress: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      value: EidosSyncProgress
    ) => listener(value)
    ipcRenderer.on(IPC_CHANNELS.syncProgress, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.syncProgress, handler)
  },
  getSyncQueueStatus: () => ipcRenderer.invoke(IPC_CHANNELS.syncQueueStatus),
  onSyncQueueChanged: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      value: EidosSyncQueueStatus
    ) => listener(value)
    ipcRenderer.on(IPC_CHANNELS.syncQueueChanged, handler)
    return () =>
      ipcRenderer.removeListener(IPC_CHANNELS.syncQueueChanged, handler)
  },
  copyLocalRecoverySpace: () =>
    ipcRenderer.invoke(IPC_CHANNELS.syncRecoverLocal),
  cloneHostedRecoverySpace: () =>
    ipcRenderer.invoke(IPC_CHANNELS.syncRecoverHosted),
  getSyncMergeStatus: () => ipcRenderer.invoke(IPC_CHANNELS.syncMergeStatus),
  planSyncMerge: () => ipcRenderer.invoke(IPC_CHANNELS.syncMergePlan),
  applySyncMerge: (request) =>
    ipcRenderer.invoke(IPC_CHANNELS.syncMergeApply, request),
  listSyncMergePaths: (request) =>
    ipcRenderer.invoke(IPC_CHANNELS.syncMergePaths, request),
  listSyncMergeConflicts: (request) =>
    ipcRenderer.invoke(IPC_CHANNELS.syncMergeConflicts, request),
  readSyncMergeVersion: (request) =>
    ipcRenderer.invoke(IPC_CHANNELS.syncMergeVersion, request),
  diffSyncMergeSqlite: (request) =>
    ipcRenderer.invoke(IPC_CHANNELS.syncMergeSqliteDiff, request),
  resolveSyncMergePath: (request) =>
    ipcRenderer.invoke(IPC_CHANNELS.syncMergeResolvePath, request),
  resolveSyncMergeRow: (request) =>
    ipcRenderer.invoke(IPC_CHANNELS.syncMergeResolveRow, request),
  resolveSyncMergeCell: (request) =>
    ipcRenderer.invoke(IPC_CHANNELS.syncMergeResolveCell, request),
  resolveSyncMergeTable: (request) =>
    ipcRenderer.invoke(IPC_CHANNELS.syncMergeResolveTable, request),
  unresolveSyncMergePath: (request) =>
    ipcRenderer.invoke(IPC_CHANNELS.syncMergeUnresolvePath, request),
  writeSyncMergeText: (request) =>
    ipcRenderer.invoke(IPC_CHANNELS.syncMergeWriteText, request),
  continueSyncMerge: (request) =>
    ipcRenderer.invoke(IPC_CHANNELS.syncMergeContinue, request),
  abortSyncMerge: (stateToken) =>
    ipcRenderer.invoke(IPC_CHANNELS.syncMergeAbort, stateToken),
  openSyncHelp: (destination) =>
    ipcRenderer.invoke(IPC_CHANNELS.syncOpenHelp, destination),
  publishFile: (request) =>
    ipcRenderer.invoke(IPC_CHANNELS.publishRun, request),
  collectPublishedForm: (request) =>
    ipcRenderer.invoke(IPC_CHANNELS.publishCollectRun, request),
  listPublicationBindings: (request) =>
    ipcRenderer.invoke(IPC_CHANNELS.publishBindingsList, request),
  setActivePublicationSource: (relativePath) =>
    ipcRenderer.invoke(IPC_CHANNELS.publishCollectorActiveSource, relativePath),
  onPublishProgress: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      value: EidosPublishProgress
    ) => listener(value)
    ipcRenderer.on(IPC_CHANNELS.publishProgress, handler)
    return () =>
      ipcRenderer.removeListener(IPC_CHANNELS.publishProgress, handler)
  },
  revealPath: (relativePath) =>
    ipcRenderer.invoke(IPC_CHANNELS.revealPath, relativePath),
  openPath: (relativePath) =>
    ipcRenderer.invoke(IPC_CHANNELS.openPath, relativePath),
  copyPathText: (relativePath, mode) =>
    ipcRenderer.invoke(IPC_CHANNELS.copyPathText, relativePath, mode),
}

contextBridge.exposeInMainWorld("eidosLite", Object.freeze(api))
