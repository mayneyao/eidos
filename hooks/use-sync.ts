import { SimpleBackUp } from "@/worker/backup"

import { useConfigStore } from "@/app/settings/store"

export const useSync = () => {
  const { backupServer } = useConfigStore()
  const push = async (space: string) => {
    const { endpointUrl, accessKeyId, secretAccessKey, autoSaveGap } =
      backupServer
    const backup = new SimpleBackUp(
      endpointUrl,
      accessKeyId,
      secretAccessKey,
      autoSaveGap
    )
    backup.setCurrentSpace(space)
    await backup.push()
  }
  return { push }
}
