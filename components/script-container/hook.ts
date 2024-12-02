import { useAppRuntimeStore } from "@/lib/store/runtime-store"

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
  }) => {
    const { input, context, code, id, command = "default", bindings } = props
    setRunningCommand(command)
    const channel = new MessageChannel()
    scriptContainerRef?.current?.contentWindow?.postMessage(
      {
        type: "ScriptFunctionCall",
        data: {
          input,
          context,
          command,
          code,
          id,
          bindings,
        },
      },
      "*",
      [channel.port2]
    )
    return new Promise((resolve, reject) => {
      channel.port1.onmessage = (event) => {
        const { type, data } = event.data
        if (type === "ScriptFunctionCallResponse") {
          resolve(data)
          setRunningCommand(null)
        } else if (type === "ScriptFunctionCallError") {
          reject(data)
          setRunningCommand(null)
        }
      }
    })
  }
  return {
    callFunction,
  }
}
