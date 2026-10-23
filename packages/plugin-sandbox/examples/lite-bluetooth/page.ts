import type { Mount, Disposable } from "@eidos.space/plugin-sdk"
const mount: Mount = (ctx, root) => {
  const background = ctx.capabilities.background!
  const output = document.createElement("pre")
  output.textContent =
    "Choose a BLE device exposing the Battery Service (0x180F)."
  let subscription: Disposable | undefined
  let busy = false
  const subscribe = async () => {
    subscription?.dispose()
    subscription = await background.onMessage((value) => {
      output.textContent = JSON.stringify(value, null, 2)
    })
  }
  const addButton = (title: string, action: () => Promise<unknown>) => {
    const button = document.createElement("button")
    button.textContent = title
    button.onclick = () => {
      if (busy) return
      busy = true
      button.disabled = true
      void action()
        .then((result) => {
          output.textContent = JSON.stringify(result ?? null, null, 2)
        })
        .catch((error: unknown) => {
          output.textContent = String(error)
        })
        .finally(() => {
          busy = false
          button.disabled = false
        })
    }
    root.append(button)
  }
  addButton("Choose and connect", async () => {
    const device = await background.requestDevice()
    await subscribe()
    return background.request({ command: "connect", id: device.id })
  })
  addButton("Status / resume notifications", async () => {
    const status = await background.request({ command: "status" })
    await subscribe()
    return status
  })
  addButton("Read battery", () => background.request({ command: "read" }))
  addButton("Disconnect and stop", async () => {
    subscription?.dispose()
    subscription = undefined
    await background.stop()
    return "Stopped; device grant revoked."
  })
  root.append(output)
  ctx.subscriptions.add({ dispose: () => subscription?.dispose() })
}
export default mount
