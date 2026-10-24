;(() => {
  const native = globalThis.__bluetooth
  delete globalThis.__bluetooth
  const parse = JSON.parse,
    stringify = JSON.stringify
  function error(message) {
    const match =
      /^(SecurityError|NetworkError|NotFoundError|NotSupportedError|InvalidStateError|QuotaExceededError|TypeError): (.*)$/s.exec(
        message
      )
    return match?.[1] === "TypeError"
      ? new TypeError(match[2])
      : new DOMException(match?.[2] ?? message, match?.[1] ?? "NetworkError")
  }
  function host(method, data) {
    const reply = parse(native(method, stringify(data)))
    if (!reply.ok) throw error(reply.error)
    return reply.value
  }
  const pending = new Map(),
    devices = new Map(),
    servers = new WeakMap(),
    services = new WeakMap(),
    characteristics = new WeakMap()
  const key = {}
  function request(method, data = {}) {
    return new Promise((resolve, reject) => {
      const id = host(method, data)
      pending.set(id, { resolve, reject })
    })
  }
  function canonical(value) {
    if (typeof value === "number") {
      if (!Number.isInteger(value) || value < 0 || value > 0xffffffff)
        throw new TypeError("Invalid UUID number")
      value =
        value.toString(16).padStart(8, "0") + "-0000-1000-8000-00805f9b34fb"
    }
    return host("uuid", String(value))
  }
  class BluetoothUUID {
    static canonicalUUID(value) {
      if (typeof value !== "number")
        throw new TypeError("Expected a UUID number")
      return canonical(value)
    }
    static getService(value) {
      return canonical(value)
    }
    static getCharacteristic(value) {
      return canonical(value)
    }
    static getDescriptor(value) {
      return canonical(value)
    }
  }
  class Bluetooth extends EventTarget {
    constructor(token) {
      super()
      if (token !== key) throw new TypeError("Illegal constructor")
    }
    async getDevices() {
      return (await request("devices")).map((info) => {
        if (!devices.has(info.id))
          devices.set(info.id, new BluetoothDevice(key, info))
        return devices.get(info.id)
      })
    }
    async getAvailability() {
      return request("available")
    }
    async requestDevice() {
      throw new DOMException(
        "This host has no device picker. Grant devices in the host policy and use getDevices().",
        "NotSupportedError"
      )
    }
  }
  class BluetoothDevice extends EventTarget {
    #id
    #name
    #gatt
    constructor(token, info) {
      super()
      if (token !== key) throw new TypeError("Illegal constructor")
      this.#id = info.id
      this.#name = info.name ?? undefined
      this.#gatt = new BluetoothRemoteGATTServer(key, this)
      this.ongattserverdisconnected = null
    }
    get id() {
      return this.#id
    }
    get name() {
      return this.#name
    }
    get gatt() {
      return this.#gatt
    }
  }
  class BluetoothRemoteGATTServer {
    constructor(token, device) {
      if (token !== key) throw new TypeError("Illegal constructor")
      servers.set(this, {
        device,
        connected: false,
        epoch: 0,
        ticket: 0,
        connecting: null,
        services: new Map(),
      })
    }
    get device() {
      return servers.get(this).device
    }
    get connected() {
      return servers.get(this).connected
    }
    connect() {
      const state = servers.get(this)
      if (state.connected) return Promise.resolve(this)
      if (state.connecting) return state.connecting
      const ticket = ++state.ticket
      const operation = request("connect", { device: state.device.id }).then(
        (epoch) => {
          if (ticket !== state.ticket)
            throw new DOMException("Connection was cancelled", "AbortError")
          state.epoch = epoch
          state.connected = true
          return this
        }
      )
      state.connecting = operation
      // Both callbacks handle their returned promise; no unhandled finally branch.
      operation.then(
        () => {
          if (state.connecting === operation) state.connecting = null
        },
        () => {
          if (state.connecting === operation) state.connecting = null
        }
      )
      return operation
    }
    disconnect() {
      const state = servers.get(this)
      if (!state.connected && !state.connecting) return
      // Queue first; a full host queue must not silently pretend it disconnected.
      const id = host("disconnect", { device: state.device.id })
      pending.set(id, {
        resolve() {},
        reject(e) {
          console.error("Bluetooth disconnect:", e.message)
        },
      })
      ++state.ticket
      state.connecting = null
      state.connected = false
      state.services.clear()
      // The host emits gattserverdisconnected after native disconnect completes.
    }
    async getPrimaryService(uuid) {
      const state = servers.get(this)
      if (!state.connected)
        throw new DOMException("GATT server is disconnected", "NetworkError")
      uuid = BluetoothUUID.getService(uuid)
      const epoch = state.epoch
      await request("service", {
        device: state.device.id,
        epoch,
        service: uuid,
      })
      if (!state.connected || state.epoch !== epoch)
        throw new DOMException("GATT connection changed", "NetworkError")
      if (!state.services.has(uuid))
        state.services.set(
          uuid,
          new BluetoothRemoteGATTService(key, this.device, uuid, epoch)
        )
      return state.services.get(uuid)
    }
  }
  function serviceData(service) {
    const state = services.get(service),
      server = servers.get(state.device.gatt)
    if (!server.connected || state.epoch !== server.epoch)
      throw new DOMException(
        "GATT object belongs to a disconnected session",
        "InvalidStateError"
      )
    return { device: state.device.id, epoch: state.epoch, service: state.uuid }
  }
  class BluetoothRemoteGATTService {
    constructor(token, device, uuid, epoch) {
      if (token !== key) throw new TypeError("Illegal constructor")
      services.set(this, { device, uuid, epoch, characteristics: new Map() })
    }
    get device() {
      return services.get(this).device
    }
    get uuid() {
      return services.get(this).uuid
    }
    get isPrimary() {
      return true
    }
    async getCharacteristic(uuid) {
      const data = serviceData(this)
      uuid = BluetoothUUID.getCharacteristic(uuid)
      const properties = await request("characteristic", {
        ...data,
        characteristic: uuid,
      })
      serviceData(this)
      const cache = services.get(this).characteristics
      if (!cache.has(uuid))
        cache.set(
          uuid,
          new BluetoothRemoteGATTCharacteristic(key, this, uuid, properties)
        )
      return cache.get(uuid)
    }
  }
  function dataView(bytes) {
    return new DataView(Uint8Array.from(bytes).buffer)
  }
  class BluetoothRemoteGATTCharacteristic extends EventTarget {
    constructor(token, service, uuid, properties) {
      super()
      if (token !== key) throw new TypeError("Illegal constructor")
      characteristics.set(this, {
        service,
        uuid,
        properties: Object.freeze(properties),
        value: null,
        subscribed: false,
      })
      this.oncharacteristicvaluechanged = null
    }
    get service() {
      return characteristics.get(this).service
    }
    get uuid() {
      return characteristics.get(this).uuid
    }
    get properties() {
      return characteristics.get(this).properties
    }
    get value() {
      return characteristics.get(this).value
    }
    async readValue() {
      const value = await request("read", {
        ...serviceData(this.service),
        characteristic: this.uuid,
      })
      serviceData(this.service)
      characteristics.get(this).value = dataView(value)
      this.dispatchEvent(new Event("characteristicvaluechanged"))
      return this.value
    }
    async writeValueWithResponse(value) {
      await this.#write("write", value)
    }
    async writeValueWithoutResponse(value) {
      await this.#write("writeWithoutResponse", value)
    }
    async #write(method, value) {
      const bytes =
        value instanceof ArrayBuffer
          ? new Uint8Array(value)
          : ArrayBuffer.isView(value)
            ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
            : null
      if (bytes === null) throw new TypeError("Expected BufferSource")
      if (bytes.length > 512)
        throw new DOMException(
          "GATT value exceeds 512 bytes",
          "QuotaExceededError"
        )
      await request(method, {
        ...serviceData(this.service),
        characteristic: this.uuid,
        value: Array.from(bytes),
      })
      serviceData(this.service)
    }
    async startNotifications() {
      await request("subscribe", {
        ...serviceData(this.service),
        characteristic: this.uuid,
      })
      serviceData(this.service)
      characteristics.get(this).subscribed = true
      return this
    }
    async stopNotifications() {
      await request("unsubscribe", {
        ...serviceData(this.service),
        characteristic: this.uuid,
      })
      serviceData(this.service)
      characteristics.get(this).subscribed = false
      return this
    }
  }
  const bluetooth = new Bluetooth(key)
  Object.defineProperty(globalThis, "navigator", {
    value: Object.freeze({ bluetooth }),
    enumerable: true,
  })
  Object.assign(globalThis, {
    Bluetooth,
    BluetoothUUID,
    BluetoothDevice,
    BluetoothRemoteGATTServer,
    BluetoothRemoteGATTService,
    BluetoothRemoteGATTCharacteristic,
  })
  return {
    bluetooth(text) {
      const event = parse(text)
      if (event.type === "result") {
        const item = pending.get(event.id)
        if (!item) return
        pending.delete(event.id)
        if (event.ok) item.resolve(event.value)
        else item.reject(error(event.error))
        return
      }
      const device = devices.get(event.device)
      if (!device) return
      const state = servers.get(device.gatt)
      if (event.type === "disconnected") {
        if (state.epoch !== event.epoch) return
        state.connected = false
        state.services.clear()
        device.dispatchEvent(new Event("gattserverdisconnected"))
      } else if (
        event.type === "notification" &&
        state.connected &&
        state.epoch === event.epoch
      ) {
        const service = state.services.get(event.service)
        const characteristic =
          service &&
          services.get(service).characteristics.get(event.characteristic)
        if (!characteristic || !characteristics.get(characteristic).subscribed)
          return
        characteristics.get(characteristic).value = dataView(event.value)
        characteristic.dispatchEvent(new Event("characteristicvaluechanged"))
      }
    },
  }
})()
