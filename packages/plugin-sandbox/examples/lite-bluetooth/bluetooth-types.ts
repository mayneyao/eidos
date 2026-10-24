// The Web Bluetooth-style subset used by this example. No runtime code.
export interface Characteristic extends EventTarget {
  readonly value?: DataView
  readonly properties: { notify: boolean; indicate: boolean }
  readValue(): Promise<DataView>
  startNotifications(): Promise<Characteristic>
}
interface Service {
  getCharacteristic(uuid: string): Promise<Characteristic>
}
interface Server {
  readonly connected: boolean
  connect(): Promise<Server>
  disconnect(): void
  getPrimaryService(uuid: string): Promise<Service>
}
export interface Device extends EventTarget {
  readonly id: string
  readonly name?: string
  readonly gatt: Server
  ongattserverdisconnected: (() => void) | null
}
declare global {
  interface Navigator {
    readonly bluetooth: { getDevices(): Promise<Device[]> }
  }
}
