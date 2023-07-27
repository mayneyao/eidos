import { SimpleBackUp } from "@/worker/backup"

import { useConfigStore } from "@/app/settings/store"

export const useSync = () => {
  const { backupServer } = useConfigStore()
  const push = async (space: string) => {
    const { token, url, autoSaveGap } = backupServer
    const backup = new SimpleBackUp(url, token, autoSaveGap)
    backup.setCurrentSpace(space)
    await backup.push()
  }
  return { push }
}
