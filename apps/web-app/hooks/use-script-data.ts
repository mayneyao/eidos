import { useScriptFunction } from "@/components/script-container/hook"
import { useSqlite } from "./use-sqlite"
import { useCurrentPathInfo } from "./use-current-pathinfo"

export const useScriptData = () => {
  const { callFunction } = useScriptFunction()
  const { sqlite } = useSqlite()
  const { space } = useCurrentPathInfo()

  const getScriptData = async (scriptId: string) => {
    if (!sqlite) {
      throw new Error("Sqlite not found")
    }
    const script = await sqlite?.script.get(scriptId)
    if (!script) {
      throw new Error("Script not found")
    }
    const data = await callFunction({
      input: {},
      command: "data",
      context: {},
      code: script.code,
      id: script.id,
      bindings: script.bindings,
      type: script.type,
      space: space,
    })
    return data
  }

  return {
    getScriptData,
  }
}
