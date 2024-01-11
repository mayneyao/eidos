import { z } from "zod"

import { MsgType } from "@/lib/const"
import { getUuid } from "@/lib/utils"

const msgType = z.object({
  id: z.string(),
  data: z.object({
    space: z.string(),
    method: z.string(),
    params: z.array(z.any()),
  }),
})

type IMsg = z.infer<typeof msgType>

const deserializedMsg = (str: string): IMsg => {
  try {
    const res = JSON.parse(str)
    return res
  } catch (error) {
    throw new Error("invalid msg")
  }
}

export const initWs = (handleFunctionCall: Function, url: string) => {
  const ws = new WebSocket(url)
  ws.onopen = () => {
    console.log("Connected to server")
    postMessage("msg:Connected to server")
    postMessage({
      id: getUuid(),
      data: null,
      type: MsgType.WebSocketConnected,
    })
  }
  ws.onmessage = (e) => {
    const channel = new MessageChannel()
    const msg = deserializedMsg(e.data)
    handleFunctionCall(msg.data, msg.id, channel.port1)
    channel.port2.onmessage = (e) => {
      ws.send(JSON.stringify(e.data))
    }
  }
  ws.onclose = () => {
    console.log("Disconnected from server")
    postMessage({
      id: getUuid(),
      data: null,
      type: MsgType.WebSocketDisconnected,
    })
  }
  return ws
}
