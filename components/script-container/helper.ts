import { getPythonWorker } from "@/lib/python/worker";
import { DataSpace } from "@/worker/web-worker/DataSpace";
import sdkInjectScript from "./sdk-inject-script.html?raw";

export const makeSdkInjectScript = ({
    bindings,
    space,
}: {
    bindings?: Record<string, { type: "table"; value: string }>
    space: string
}) => {
    let res = sdkInjectScript.replace("${{currentSpace}}", space)
    if (bindings) {
        res = `<script>window.__EIDOS_BINDINGS__ = ${JSON.stringify(bindings)}</script>` + res
    }
    return res
}

interface IPythonScriptCallProps {
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

export const callScriptById = async (id: string, input: Record<string, any>, sqlite: DataSpace) => {
    const script = await sqlite.getScript(id)
    if (!script) {
        throw new Error("Script not found")
    }
    return callPythonScript({
        input,
        code: script.code,
        id,
        context: {
            tables: script.tables,
            env: {},
        },
        command: 'main',
    })
}
