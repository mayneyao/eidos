import { DataSpace } from "@/worker/web-worker/DataSpace"

export const handleFunctionCall = async (
    data: {
        space: string
        dbName: string
        method: string
        params: any[]
        userId: string
    },
    dataSpace: DataSpace | null
) => {
    if (!dataSpace) {
        throw new Error("DataSpace is null")
    }
    const { method, params = [] } = data
    let callMethod: Function = () => { }
    if (method.includes(".")) {
        let obj: any = dataSpace
        const properties = method.split(".")
        // const r = await sqlite.table("91ba4dd2ad4447cf943db88dbb861323").rows.query()
        for (const property of properties.slice(0, -1)) {
            // if property like `table("91ba4dd2ad4447cf943db88dbb861323")` it means we need to call table function
            // and pass the result to next function
            if (property.includes("(") && property.includes(")")) {
                const [funcName, funcParams] = property.split("(")
                const func = obj[funcName].bind(obj)
                const params = funcParams.slice(0, -1).split(",")
                obj = await func(...params)
            } else {
                obj = obj[property]
            }
        }
        callMethod = (obj[properties[properties.length - 1]] as Function).bind(obj)
    } else {
        callMethod = (dataSpace[method as keyof DataSpace] as Function).bind(
            dataSpace
        )
    }
    const res = await callMethod(...params)
    return res
}