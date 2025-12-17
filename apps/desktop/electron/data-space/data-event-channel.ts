import { EventEmitter } from "events"

import { EidosDataEventChannelName } from "@/lib/const"

import { win } from "../main"

export function createDataEventChannel() {
  const dataEventEmitter = new EventEmitter()

  return {
    name: EidosDataEventChannelName,
    postMessage: (data: any) => {
      win?.webContents.send(EidosDataEventChannelName, data)

      // delay to emit event to avoid query busy
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
