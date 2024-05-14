import {
  EidosFileSystemManager,
  FileSystemType,
  efsManager,
} from "@/lib/storage/eidos-file-system"
import { getIndexedDBValue } from "@/lib/storage/indexeddb"
import { BackupServerFormValues } from "@/app/settings/backup/page"

import { GithubBackupServer } from "./provider/github"

declare var self: ServiceWorkerGlobalScope

export const getConfigFromOpfs = async () => {
  const configStr = await efsManager.getDocContent(["__eidos__config.json"])
  const config: BackupServerFormValues = configStr ? JSON.parse(configStr) : {}
  return config
}

export const getLastSyncStatus = async () => {
  const syncStatusStr = await efsManager.getDocContent([
    "__eidos__sync-status.json",
  ])
  const syncStatus: Record<string, string> = syncStatusStr
    ? JSON.parse(syncStatusStr)
    : {}
  return syncStatus
}

export const updateLastSyncStatus = async (
  syncStatus: Record<string, string>
) => {
  await efsManager.updateOrCreateDocFile(
    ["__eidos__sync-status.json"],
    JSON.stringify(syncStatus)
  )
}

const notifyMain = async (data: {
  space: string
  type: "push-done" | "pull-done"
}) => {
  let cls = await self.clients.matchAll()
  cls[0].postMessage({
    type: "backup-result",
    data,
  })
}

const pushSpace2Backup = async (space: string) => {
  //  get config from opfs config file
  const config = await getConfigFromOpfs()
  const { Github__enabled, Github__repo, Github__token } = config
  if (Github__enabled && Github__repo && Github__token) {
    const [owner, repo] = Github__repo.split("/")
    const githubBackupServer = new GithubBackupServer(
      Github__token,
      owner,
      repo
    )
    const syncStatus: Record<string, string> = {}
    await githubBackupServer.push(`spaces/${space.trim()}`)
    const now = new Date()
    syncStatus[space] = now.toISOString()
    const lastSyncStatus = await getLastSyncStatus()
    const newSyncStatus = { ...lastSyncStatus, ...syncStatus }
    await updateLastSyncStatus(newSyncStatus)
    // self.registration.showNotification("Backup successful", {
    //   body: `Space ${space} has been backed up`,
    // })
    notifyMain({ space, type: "push-done" })
  }
}

const pullSpaceFromBackup = async (space: string) => {
  //  get config from opfs config file
  const config = await getConfigFromOpfs()
  const { Github__enabled, Github__repo, Github__token } = config
  if (Github__enabled && Github__repo && Github__token) {
    const [owner, repo] = Github__repo.split("/")
    const githubBackupServer = new GithubBackupServer(
      Github__token,
      owner,
      repo
    )
    await githubBackupServer.pull(`spaces/${space.trim()}`)
    // self.registration.showNotification("Restore successful", {
    //   body: `Space ${space} has been restored, please refresh the page`,
    // })
    notifyMain({ space, type: "pull-done" })
  }
}

export const backUpPushOnce = async () => {
  const currentSpace = await getIndexedDBValue("kv", "lastOpenedDatabase")
  if (currentSpace) {
    await pushSpace2Backup(currentSpace)
  }
}

export const backUpPullOnce = async () => {
  const currentSpace = await getIndexedDBValue("kv", "lastOpenedDatabase")
  if (currentSpace) {
    await pullSpaceFromBackup(currentSpace)
  }
}

export const autoBackup = async () => {
  const config = await getConfigFromOpfs()
  const { Github__enabled, Github__repo, Github__token, spaceList } = config
  if (Github__enabled && Github__repo && Github__token) {
    const [owner, repo] = Github__repo.split("/")
    const githubBackupServer = new GithubBackupServer(
      Github__token,
      owner,
      repo
    )
    const spaces = spaceList?.split(",") || []
    const syncStatus: Record<string, string> = {}
    for (const space of spaces) {
      await githubBackupServer.push(`spaces/${space.trim()}`)
      const now = new Date()
      syncStatus[space] = now.toISOString()
    }
    const lastSyncStatus = await getLastSyncStatus()
    const newSyncStatus = { ...lastSyncStatus, ...syncStatus }
    await updateLastSyncStatus(newSyncStatus)
  }
}

export const backupAllSpaceData = async () => {
  const fsType = await getIndexedDBValue<FileSystemType>("kv", "fs")
  // only when fs is set to NFS, we do the backup. copy db.sqlite3 to the nfs folder
  if (fsType !== FileSystemType.NFS) {
    return
  }
  const opfsRoot = await navigator.storage.getDirectory()
  const opfsManager = new EidosFileSystemManager(opfsRoot)
  const spaces = await opfsManager.listDir(["spaces"])
  for (const space of spaces) {
    const dbPaths = ["spaces", space.name, "db.sqlite3"]
    if (!(await opfsManager.checkFileExists(dbPaths))) {
      continue
    }
    const isNFSdbExist = await efsManager.checkFileExists(dbPaths)
    const opfsDB = await opfsManager.getFile(dbPaths)
    // check modified time
    if (!isNFSdbExist) {
      console.log(`backup ${space.name} db.sqlite3 into NFS`)
      await opfsManager.copyFile(dbPaths, efsManager)
      console.log(`backup ${space.name} db.sqlite3 done`)
    } else {
      const nfsDB = await efsManager.getFile(dbPaths)
      if (nfsDB.lastModified < opfsDB.lastModified) {
        console.log(`backup ${space.name} db.sqlite3 into NFS`)
        await opfsManager.copyFile(dbPaths, efsManager)
        console.log(`backup ${space.name} db.sqlite3 done`)
      }
    }
  }
}
