import { opfsManager } from "@/lib/opfs"
import { BackupServerFormValues } from "@/app/settings/backup/page"

import { GithubBackupServer } from "./provider/github"

export const getConfigFromOpfs = async () => {
  const configStr = await opfsManager.getDocContent(["__eidos__config.json"])
  const config: BackupServerFormValues = configStr ? JSON.parse(configStr) : {}
  return config
}

export const getLastSyncStatus = async () => {
  const syncStatusStr = await opfsManager.getDocContent([
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
  await opfsManager.updateOrCreateDocFile(
    ["__eidos__sync-status.json"],
    JSON.stringify(syncStatus)
  )
}

export const backupSpace = async (space: string) => {
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
  }
}

export const pullSpaceFromBackup = async (space: string) => {
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
