import { useAppRuntimeStore } from "@/lib/store/runtime-store"
import { callPythonScript } from "./helper"

type IScriptInput = Record<string, any>

interface IScriptContext {
  tables: any
  env: Record<string, any>
  currentNodeId?: string | null
  currentRowId?: string | null
  currentViewId?: string | null
  currentViewQuery?: string | null
  callFromTableAction?: boolean
}

export const useScriptFunction = () => {
  const { scriptContainerRef, setRunningCommand } = useAppRuntimeStore()

  const callFunction = async (props: {
    input: IScriptInput
    context: IScriptContext
    code: string
    command: string
    id: string
    bindings?: Record<string, any>
    type?: string
  }) => {
    const { command = "default" } = props
    setRunningCommand(command)

    try {
      const result = props.type === "py_script" 
        ? await callPythonScript(props)
        : await callJavaScript(props, scriptContainerRef)
      
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

// Helper function to handle JavaScript execution
const callJavaScript = (
  props: {
    input: IScriptInput
    context: IScriptContext
    code: string
    command: string
    id: string
    bindings?: Record<string, any>
  },
  scriptContainerRef: any
): Promise<any> => {
  const channel = new MessageChannel()
  
  scriptContainerRef?.current?.contentWindow?.postMessage(
    {
      type: "ScriptFunctionCall",
      data: props,
    },
    "*",
    [channel.port2]
  )

  return new Promise((resolve, reject) => {
    channel.port1.onmessage = (event) => {
      const { type, data } = event.data
      if (type === "ScriptFunctionCallResponse") {
        resolve(data)
      } else if (type === "ScriptFunctionCallError") {
        reject(data)
      }
    }
  })
}

export const useCallScript = () => {
  const { callFunction } = useScriptFunction()

  return {
    callFunction,
  }
}
