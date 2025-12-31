import { EventEmitter } from "events"

import { EidosDataEventChannelName } from "@/lib/const"

type MessageForwarder = (channel: string, data: any) => void

/**
 * SQLite data changes sometimes have side effects that require delayed processing.
 * Instead of updating directly in a SQL trigger, updates are performed after some computation.
 *
 * The side-effect calculation service and SQLite reside in the same process, communicating via the data event channel.
 * Data change events also need to be synchronized to the renderer for reactive UI updates.
 *
 *  cdc ──────▶ dataeventchannel ──┬──(setTimeout 100ms)──▶ effect service
 *                                 │
 *                                 └──(forwardTo)─────────▶ renderer
 *
 * @param forwardTo - function to forward the message to the renderer
 * @returns
 */
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
