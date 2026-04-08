"use desktop"

import { toast } from "@/components/ui/use-toast"
import { isDesktopMode } from "@/lib/env"

export const useEngine = () => {
  const close = async () => {
    if (!isDesktopMode) {
      return
    }
    const { success } = await window.eidos.space.closeDataSpace()
    if (!success) {
      toast({
        title: "Close data space failed",
      })
    }
  }
  const reload = async () => {
    if (!isDesktopMode) {
      return
    }
    const { success } = await window.eidos.space.reloadDataSpace()
    const { success: success2 } = await window.eidos.space.reloadQueryWorker()
    const reloadDone = success && success2
    if (!reloadDone) {
      toast({
        title: "Reload compute engine failed",
        description: "Changing UDF may cause some table calculations to fail",
      })
    }
  }

  return { reload, close }
}
