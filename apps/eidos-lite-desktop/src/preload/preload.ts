import { contextBridge, ipcRenderer } from "electron"

import {
  IPC_CHANNELS,
  type EidosLiteApi,
  type EidosSyncProgress,
  type EidosSyncQueueStatus,
  type RuntimeCalls,
  type RuntimeMethod,
  type SpaceSnapshot,
} from "../shared/contracts"

const api: EidosLiteApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC_CHANNELS.appInfo),
  openSpace: () => ipcRenderer.invoke(IPC_CHANNELS.openSpace),
  newSpace: () => ipcRenderer.invoke(IPC_CHANNELS.newSpace),
  listRecentSpaces: () => ipcRenderer.invoke(IPC_CHANNELS.recentSpaces),
  openRecentSpace: (id) => ipcRenderer.invoke(IPC_CHANNELS.openRecentSpace, id),
  removeRecentSpace: (id) =>
    ipcRenderer.invoke(IPC_CHANNELS.removeRecentSpace, id),
  getSpace: () => ipcRenderer.invoke(IPC_CHANNELS.getSpace),
  refreshSpace: () => ipcRenderer.invoke(IPC_CHANNELS.refreshSpace),
  onSpaceChanged: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, value: SpaceSnapshot) =>
      listener(value)
    ipcRenderer.on(IPC_CHANNELS.spaceChanged, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.spaceChanged, handler)
  },
  openEidosFile: (relativePath) =>
    ipcRenderer.invoke(IPC_CHANNELS.openFile, relativePath),
  closeEidosFile: (sessionId) =>
    ipcRenderer.invoke(IPC_CHANNELS.closeFile, sessionId),
  createEidosFile: (parentRelativePath, name) =>
    ipcRenderer.invoke(IPC_CHANNELS.createEidosFile, parentRelativePath, name),
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
  callRuntime: <M extends RuntimeMethod>(
    sessionId: string,
    method: M,
    args: RuntimeCalls[M]["args"]
  ) => ipcRenderer.invoke(IPC_CHANNELS.runtimeCall, sessionId, method, args),
  enableVersioning: () => ipcRenderer.invoke(IPC_CHANNELS.enableVersioning),
  createCheckpoint: (message) =>
    ipcRenderer.invoke(IPC_CHANNELS.createCheckpoint, message),
  getVersionChanges: () => ipcRenderer.invoke(IPC_CHANNELS.versionChanges),
  getVersionHistory: (limit) =>
    ipcRenderer.invoke(IPC_CHANNELS.versionHistory, limit),
  getVersionDiff: (commitId, parentId) =>
    ipcRenderer.invoke(IPC_CHANNELS.versionDiff, commitId, parentId),
  restoreCheckpoint: (commitId, expectedHead) =>
    ipcRenderer.invoke(IPC_CHANNELS.restoreCheckpoint, commitId, expectedHead),
  getSyncStatus: () => ipcRenderer.invoke(IPC_CHANNELS.syncStatus),
  beginSyncSignIn: () => ipcRenderer.invoke(IPC_CHANNELS.syncSignIn),
  signOutSync: () => ipcRenderer.invoke(IPC_CHANNELS.syncSignOut),
  getSyncPreflight: () => ipcRenderer.invoke(IPC_CHANNELS.syncPreflight),
  enableSync: (approval) =>
    ipcRenderer.invoke(IPC_CHANNELS.syncEnable, approval),
  listSyncRepositories: () => ipcRenderer.invoke(IPC_CHANNELS.syncRepositories),
  cloneSyncRepository: (remoteUrl) =>
    ipcRenderer.invoke(IPC_CHANNELS.syncClone, remoteUrl),
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
  openSyncHelp: (destination) =>
    ipcRenderer.invoke(IPC_CHANNELS.syncOpenHelp, destination),
  revealPath: (relativePath) =>
    ipcRenderer.invoke(IPC_CHANNELS.revealPath, relativePath),
  openPath: (relativePath) =>
    ipcRenderer.invoke(IPC_CHANNELS.openPath, relativePath),
}

contextBridge.exposeInMainWorld("eidosLite", Object.freeze(api))
