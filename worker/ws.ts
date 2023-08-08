import { deserializedMsg } from "@/api/helper"

export const initWs = (handleFunctionCall: Function) => {
  const ws = new WebSocket("ws://localhost:3333")
  ws.onopen = () => {
    console.log("Connected to server")
  }
  ws.onmessage = (e) => {
    const channel = new MessageChannel()
    const msg = deserializedMsg(e.data)
    handleFunctionCall(msg.data, msg.id, channel.port1)
    channel.port2.onmessage = (e) => {
      ws.send(JSON.stringify(e.data))
    }
  }
}
