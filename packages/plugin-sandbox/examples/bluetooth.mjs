// No connection at startup. JSON messages from stdin control this worker.
let device = null
let battery = null
let commands = Promise.resolve()

const batteryChanged = (event) => {
  const value = event.target.value
  if (value.byteLength)
    postMessage({ type: "battery", id: device?.id, percent: value.getUint8(0) })
}

async function disconnect() {
  if (!device?.gatt.connected) return
  const done = new Promise((resolve) =>
    device.addEventListener("gattserverdisconnected", resolve, { once: true })
  )
  device.gatt.disconnect()
  await done
}

async function handle(message) {
  switch (message.type) {
    case "list": {
      const devices = await navigator.bluetooth.getDevices()
      postMessage({
        type: "devices",
        devices: devices.map(({ id, name }) => ({ id, name })),
      })
      break
    }
    case "connect": {
      if (device?.gatt.connected)
        throw new Error("Disconnect the current device first")
      const devices = await navigator.bluetooth.getDevices()
      device = devices.find((item) => item.id === message.id)
      if (!device) throw new Error("Device is not granted by the host")
      device.ongattserverdisconnected = () => {
        battery = null
        postMessage({ type: "disconnected", id: device.id })
      }
      const server = await device.gatt.connect()
      postMessage({ type: "connected", id: device.id, name: device.name })
      try {
        const service = await server.getPrimaryService("battery_service")
        battery = await service.getCharacteristic("battery_level")
        battery.addEventListener("characteristicvaluechanged", batteryChanged)
        await battery.readValue()
        if (battery.properties.notify || battery.properties.indicate) {
          await battery.startNotifications()
          postMessage({ type: "subscribed", id: device.id })
        }
      } catch (error) {
        // Avoid leaving a half-configured connection alive after setup fails.
        await disconnect()
        throw error
      }
      break
    }
    case "read":
      if (!battery) throw new Error("Connect a battery device first")
      await battery.readValue()
      break
    case "status":
      postMessage({
        type: "status",
        id: device?.id ?? null,
        connected: device?.gatt.connected ?? false,
      })
      break
    case "disconnect":
      await disconnect()
      break
    case "stop":
      await disconnect()
      close()
      break
    default:
      throw new Error("Unknown command: " + message.type)
  }
}

onmessage = ({ data }) => {
  // Preserve command order even when several JSON lines arrive together.
  commands = commands
    .then(() => handle(data))
    .catch((error) => {
      postMessage({
        type: "error",
        command: data.type,
        name: error.name,
        message: error.message,
      })
    })
}

postMessage({
  type: "ready",
  commands: ["list", "connect", "read", "status", "disconnect", "stop"],
})
