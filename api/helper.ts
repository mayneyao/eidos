import { WebSocket } from "ws"
import { z } from "zod"

export const msgDataType = z.object({
  space: z.string(),
  method: z.string(),
  params: z.array(z.any()),
})

const msgType = z.object({
  id: z.string(),
  data: msgDataType,
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
    return res
  } catch (error) {
    throw new Error("invalid msg")
  }
}
