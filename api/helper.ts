import { WebSocket } from "ws"
import { z } from "zod"

const msgType = z.object({
  id: z.string(),
  data: z.any(),
})

type IMsg = z.infer<typeof msgType>

export const wsMap = new Map<string, WebSocket>()

export const serializedMsg = (obj: any) => {
  const { success } = msgType.safeParse(obj)
  if (success) {
    return JSON.stringify(obj)
  }
  throw new Error("invalid msg")
}

export const deserializedMsg = (
  str: string
): IMsg & {
  success: boolean
} => {
  try {
    const res = JSON.parse(str)
    const { success } = msgType.safeParse(res)
    if (success) {
      return {
        ...res,
        success: true,
      }
    }
  } catch (error) {
    throw new Error("invalid msg")
  }
  return { id: "", data: null, success: false }
}
