import { getPythonWorker } from "@/lib/python/worker";
import type { DataSpace } from "@/packages/core/DataSpace";
import type { ITableActionContext } from "@/packages/core/types/IExtension";


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

export const callPythonScript = (props: IPythonScriptCallProps): Promise<any> => {
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

export const callScriptById = async (id: string, input: Record<string, any>, sqlite: DataSpace, scriptContainerRef: any, cmd?: string) => {
    const script = await sqlite.extension.getExtensionBySlugOrId(id)

    const spaceName = await sqlite.getSpaceName()
    if (!script) {
        throw new Error("Script not found")
    }

    return callJavaScript({
        input,
        code: script.code,
        id,
        context: {

        },
        command: cmd ?? 'default',
        space: spaceName
    }, scriptContainerRef)
}
