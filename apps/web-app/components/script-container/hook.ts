import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"
import type { IScriptContext, IScriptInput } from "./helper"
import { callJavaScript } from "./helper"

export const useScriptFunction = () => {
  const { scriptContainerRef, setRunningCommand } = useAppRuntimeStore()

  const callFunction = async (props: {
    input: IScriptInput
    context: IScriptContext
    code: string
    command: string
    id: string
    bindings?: Record<string, any>
    dependencies?: string[]
    type?: string
    space: string
  }) => {
    const { command = "default" } = props
    setRunningCommand(command)

    try {
      const result = await callJavaScript(props, scriptContainerRef)
      setRunningCommand(null)
      return result
    } catch (error) {
      setRunningCommand(null)
      throw error
    }
  }

  return {
    callFunction,
  }
}

export const useCallScript = () => {
  const { callFunction } = useScriptFunction()

  return {
    callFunction,
  }
}
