import { ipcRenderer } from "electron"
import { EXTENSION_RUNTIME_BOOTSTRAP_CHANNEL } from "@eidos.space/extension-runtime"

// This fixed preload exposes no API. Its only job is to carry one
// MessagePort from the main process into the sandboxed host page, which then
// transfers the port to the package Web Worker.
ipcRenderer.on(EXTENSION_RUNTIME_BOOTSTRAP_CHANNEL, (event, payload) => {
  window.postMessage(payload, "*", event.ports)
})
