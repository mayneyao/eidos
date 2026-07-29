import { app } from "electron"

const bootstrapStartedAtMs = Date.now()
const bootstrapGlobal = globalThis as typeof globalThis & {
  __eidosLiteBootstrapState?: {
    startedAtMs: number
    pendingOpenFiles: string[]
    handleOpenFile: (event: Electron.Event, filePath: string) => void
  }
}
const pendingOpenFiles: string[] = []
const handleOpenFile = (event: Electron.Event, filePath: string) => {
  event.preventDefault()
  pendingOpenFiles.push(filePath)
}

app.on("open-file", handleOpenFile)
bootstrapGlobal.__eidosLiteBootstrapState = {
  startedAtMs: bootstrapStartedAtMs,
  pendingOpenFiles,
  handleOpenFile,
}

void import("./application").catch((error: unknown) => {
  console.error("Failed to start Eidos Lite", error)
  process.exit(1)
})
