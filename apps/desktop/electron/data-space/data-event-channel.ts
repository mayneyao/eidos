import { EventEmitter } from "events"

import { EidosDataEventChannelName } from "@/lib/const"

type MessageForwarder = (channel: string, data: any) => void

export function createDataEventChannel(forwardTo: MessageForwarder) {
  const dataEventEmitter = new EventEmitter()

  return {
    name: EidosDataEventChannelName,
    postMessage: (data: any) => {
      forwardTo(EidosDataEventChannelName, data)

      setTimeout(() => {
        dataEventEmitter.emit("message", { data })
      }, 100)
    },
    set onmessage(handler: (event: { data: any }) => void) {
      dataEventEmitter.removeAllListeners("message")
      if (handler) {
        dataEventEmitter.on("message", handler)
      }
    },
    onmessageerror: null,
    addEventListener: (type: string, listener: EventListener) => {
      dataEventEmitter.on(type, listener)
    },
    removeEventListener: (type: string, listener: EventListener) => {
      dataEventEmitter.off(type, listener)
    },
    dispatchEvent: (event: Event): boolean => {
      return dataEventEmitter.emit(event.type, event)
    },
    close: () => {
      dataEventEmitter.removeAllListeners("message")
    },
  }
}
