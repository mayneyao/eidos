/**
 * RPC handler for headless server
 * Copied from @eidos.space/core/rpc.ts since npm dist doesn't include this module
 */

import type { DataSpace } from "@eidos.space/core"

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
      for (const property of properties.slice(0, -1)) {
        if (!obj) {
          throw new Error(`Cannot access property "${property}" because parent object is null or undefined (in ${method})`)
        }
        if (property.includes("(") && property.includes(")")) {
          const [funcName, funcParamsRaw] = property.split("(")
          const func = obj[funcName]
          if (typeof func !== 'function') {
             throw new Error(`Method "${funcName}" is not a function on ${funcName === method.split('.')[0] ? 'DataSpace' : property}`)
          }
          const funcParams = funcParamsRaw.slice(0, -1)
          // Simple split by comma, but handle quoted strings better
          const params = funcParams.split(",").map(p => {
            const trimmed = p.trim()
            if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || 
                (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
              return trimmed.slice(1, -1)
            }
            return trimmed
          })
          obj = await func.apply(obj, params)
        } else {
          obj = obj[property]
          if (obj === undefined) {
             const available = Object.keys(obj || {}).join(', ')
             throw new Error(`Property "${property}" undefined in ${method}. Available properties: ${available}`)
          }
        }
      }
      if (!obj) {
        throw new Error(`Parent object for final method is null or undefined (in ${method})`)
      }
      const lastProperty = properties[properties.length - 1]
      const finalFunc = obj[lastProperty]
      if (typeof finalFunc !== 'function') {
        throw new Error(`Final property ${lastProperty} is not a function in ${method}`)
      }
      callMethod = finalFunc.bind(obj)
    } else {
      const finalFunc = dataSpace[method as keyof DataSpace]
      if (typeof finalFunc !== 'function') {
        throw new Error(`Method ${method} is not a function on DataSpace`)
      }
      callMethod = (finalFunc as Function).bind(dataSpace)
    }
  } catch (error: any) {
    console.error(`[RPC Error Details] Method: ${method}, Params: ${JSON.stringify(params)}`)
    console.error(`[RPC Error Message] ${error.message}`)
    throw error
  }
  const res = await callMethod(...params)
  return res
}
