import { callScriptById } from "@/components/script-container/helper"
import { getSqliteProxy } from "@/packages/core/sqlite/channel"
import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"
import { useCurrentPathInfo } from "./use-current-pathinfo"

export const useScriptCall = () => {
  const { scriptContainerRef, setRunningCommand } = useAppRuntimeStore()
  const { space } = useCurrentPathInfo()
  const callScript = async (
    id: string,
    input: Record<string, any>,
    cmd?: string
  ) => {
    setRunningCommand(id)
    try {
      const result = await callScriptById(
        id,
        input,
        getSqliteProxy(space, ""),
        scriptContainerRef,
        cmd
      )
      setRunningCommand(null)
      return result
    } catch (error) {
      setRunningCommand(null)
      throw error
    }
  }
  return {
    callScript,
  }
}
