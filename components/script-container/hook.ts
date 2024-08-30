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
  const { scriptContainerRef } = useAppRuntimeStore()
  const callFunction = async (props: {
    input: IScriptInput
    context: IScriptContext
    code: string
    command: string
    id: string
  }) => {
    const { input, context, code, id, command = "default" } = props
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
        } else if (type === "ScriptFunctionCallError") {
          reject(data)
        }
      }
    })
  }
  return {
    callFunction,
  }
}
