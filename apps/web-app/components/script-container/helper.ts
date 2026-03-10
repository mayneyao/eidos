import { getPythonWorker } from "@/lib/python/worker"
import type { DataSpace } from "@eidos.space/core/data-space"
import type { ITableActionContext } from "@/packages/core/types/IExtension"

export type IScriptInput = Record<string, any>

export type IScriptContext = Record<string, any> | ITableActionContext

export interface IPythonScriptCallProps {
  input: Record<string, any>
  context: {
    tables: any
    env: Record<string, any>
    currentNodeId?: string | null
    currentRowId?: string | null
    currentViewId?: string | null
    currentViewQuery?: string | null
    callFromTableAction?: boolean
  }
  code: string
  command: string
  id: string
  bindings?: Record<string, any>
  dependencies?: string[]
}

// Helper function to handle JavaScript execution
export const callJavaScript = (
  props: {
    input: IScriptInput
    context: IScriptContext
    code: string
    command: string
    id: string
    bindings?: Record<string, any>
    space: string
    hash?: string
  },
  scriptContainerRef: any,
  onUpdate?: (event: MessageEvent) => void
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
    const timeoutId = setTimeout(() => {
      reject(new Error("Script execution timeout (30s)"))
    }, 30000)

    channel.port1.onmessage = (event) => {
      const { type, data } = event.data
      if (type === "ScriptFunctionCallResponse") {
        clearTimeout(timeoutId)
        resolve(data)
      } else if (type === "ScriptFunctionCallError") {
        clearTimeout(timeoutId)
        reject(data)
      } else if (onUpdate) {
        onUpdate(event)
      }
    }
  })
}

export const callPythonScript = (
  props: IPythonScriptCallProps
): Promise<any> => {
  const pythonWorker = getPythonWorker()
  const channel = new MessageChannel()

  pythonWorker.postMessage(
    {
      type: "PythonScriptCall",
      payload: props,
    },
    [channel.port2]
  )

  return new Promise((resolve, reject) => {
    channel.port1.onmessage = (event) => {
      const { type, data } = event.data
      if (type === "PythonScriptCallResponse") {
        resolve(data.result)
      } else if (type === "PythonScriptCallError") {
        reject(data.error)
      }
    }
  })
}

const simpleHash = (str: string) => {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32bit integer
  }
  return hash
}

export const callScriptById = async (
  id: string,
  input: Record<string, any>,
  sqlite: DataSpace,
  scriptContainerRef: any,
  cmd?: string
) => {
  const script = await sqlite.extension.getExtensionBySlugOrId(id)

  const spaceName = await sqlite.getSpaceName()
  if (!script) {
    throw new Error("Script not found")
  }

  const env = Object.entries(script.bindings || {}).reduce(
    (acc, [key, binding]) => {
      if (binding.type === "secret" || binding.type === "text") {
        acc[key] = binding.value
      }
      return acc
    },
    {} as Record<string, string>
  )

  const hash = simpleHash(script.code || "")

  return callJavaScript(
    {
      input,
      code: script.code,
      id,
      context: {
        env,
      },
      command: cmd ?? "default",
      space: spaceName,
      bindings: script.bindings,
      hash: String(hash),
    },
    scriptContainerRef
  )
}
