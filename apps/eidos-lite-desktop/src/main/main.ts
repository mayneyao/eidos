import { app } from "electron"

import { eidosLiteLogger } from "./logging"

const bootstrapStartedAtMs = Date.now()
const bootstrapGlobal = globalThis as typeof globalThis & {
  __eidosLiteBootstrapState?: {
    startedAtMs: number
    pendingOpenFiles: string[]
    pendingOpenUrls: string[]
    handleOpenFile: (event: Electron.Event, filePath: string) => void
    handleOpenUrl: (event: Electron.Event, url: string) => void
  }
}
const pendingOpenFiles: string[] = []
const pendingOpenUrls: string[] = []
const handleOpenFile = (event: Electron.Event, filePath: string) => {
  event.preventDefault()
  pendingOpenFiles.push(filePath)
}
const handleOpenUrl = (event: Electron.Event, url: string) => {
  event.preventDefault()
  pendingOpenUrls.push(url)
}

app.on("open-file", handleOpenFile)
app.on("open-url", handleOpenUrl)
bootstrapGlobal.__eidosLiteBootstrapState = {
  startedAtMs: bootstrapStartedAtMs,
  pendingOpenFiles,
  pendingOpenUrls,
  handleOpenFile,
  handleOpenUrl,
}

void import("./application").catch((error: unknown) => {
  eidosLiteLogger()?.error("app.startup.failed", undefined, error)
  console.error("Failed to start Eidos Lite", error)
  process.exit(1)
})
