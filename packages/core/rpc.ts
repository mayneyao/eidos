import type { DataSpace } from "./data-space"

export const workerStore: {
  currentCallUserId: string | null
} = {
  currentCallUserId: null,
}

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
  workerStore.currentCallUserId = data.userId
  let callMethod: Function = () => {}
  try {
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
      callMethod = (obj[properties[properties.length - 1]] as Function).bind(
        obj
      )
    } else {
      callMethod = (dataSpace[method as keyof DataSpace] as Function).bind(
        dataSpace
      )
    }
  } catch (error) {
    console.error(
      `Error calling method ${method}: ${JSON.stringify(
        {
          params,
          method,
          data,
        },
        null,
        2
      )}`,
      error
    )
    throw error
  }
  const res = await callMethod(...params)

  // Return the result as-is (including AsyncIterable if it's an iterator function)
  // The caller (worker.ts or main.ts) will handle iterators appropriately
  return res
}
