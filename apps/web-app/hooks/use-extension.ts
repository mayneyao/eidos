import type { IExtension } from "@/packages/core/types/IExtension"
import { useCallback, useEffect, useState } from "react"

import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"

export const useExtension = () => {
  const { sqlite } = useSqlite()
  const [installLoading, setInstallLoading] = useState(false)

  const addExtension = useCallback(async (extension: IExtension) => {
    if (!sqlite) return
    await sqlite.extension.add(extension)
    console.log("addExtension", extension)
  }, [sqlite])

  const deleteExtension = useCallback(async (id: string) => {
    if (!sqlite) return
    await sqlite.extension.del(id)
    console.log("deleteExtension", id)
  }, [sqlite])

  const updateExtension = useCallback(async (extension: Partial<IExtension>) => {
    if (!sqlite || !extension.id) return
    await sqlite.extension.set(extension.id, extension)
    console.log("updateExtension", extension)
  }, [sqlite])

  const installExtension = async (extension: IExtension) => {
    setInstallLoading(true)
    extension && (await addExtension(extension))
    setInstallLoading(false)
  }
  const enableExtension = useCallback(async (id: string) => {
    if (!sqlite) return
    await sqlite.extension.enable(id)
    console.log("enableExtension", id)
  }, [sqlite])

  const disableExtension = useCallback(async (id: string) => {
    if (!sqlite) return
    await sqlite.extension.disable(id)
    console.log("disableExtension", id)
  }, [sqlite])

  return {
    addExtension,
    deleteExtension,
    updateExtension,
    installExtension,
    installLoading,
    enableExtension,
    disableExtension,
  }
}

export const useExtensionByIdOrSlug = (id?: string) => {
  const { sqlite } = useSqlite()
  const [extension, setExtension] = useState<IExtension | null>(null)
  useEffect(() => {
    if (!sqlite || !id) return
    const fetchExtension = async () => {
      const extension = await sqlite.extension.getExtensionBySlugOrId(id)
      setExtension(extension)
    }
    fetchExtension()
  }, [sqlite, id])
  if (!id) return null
  return extension
}
