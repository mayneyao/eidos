import { randomUUID } from "node:crypto"
import path from "node:path"
import {
  BrowserWindow,
  MessageChannelMain,
  session,
  type MessagePortMain,
  type Session,
} from "electron"
import {
  EXTENSION_RUNTIME_BOOTSTRAP_CHANNEL,
  extensionRuntimeDataUrl,
} from "@eidos.space/extension-runtime"

import { Injectable } from "../../../common/di"

export interface FileExtensionRuntimeTransport {
  postMessage(message: unknown): void
  onMessage(listener: (message: unknown) => void): void
  onClose(listener: () => void): void
  dispose(): void
}

export interface CreateFileExtensionRuntimeTransportOptions {
  source: string
  generation: string
}

export interface FileExtensionRuntimeTransportFactory {
  create(
    options: CreateFileExtensionRuntimeTransportOptions
  ): Promise<FileExtensionRuntimeTransport>
}

const DENIED_RUNTIME_URLS = [
  "http://*/*",
  "https://*/*",
  "file://*/*",
  "ftp://*/*",
  "ws://*/*",
  "wss://*/*",
]

function denyAmbientCapabilities(runtimeSession: Session): void {
  runtimeSession.setPermissionCheckHandler(() => false)
  runtimeSession.setPermissionRequestHandler(
    (_webContents, _permission, done) => done(false)
  )
  runtimeSession.webRequest.onBeforeRequest(
    { urls: DENIED_RUNTIME_URLS },
    (_details, done) => done({ cancel: true })
  )
  runtimeSession.on("will-download", (event) => event.preventDefault())
}

export class ElectronFileExtensionRuntimeTransport implements FileExtensionRuntimeTransport {
  private messageListener?: (message: unknown) => void
  private closeListener?: () => void
  private started = false
  private closed = false
  private disposed = false

  constructor(
    private readonly window: BrowserWindow,
    private readonly runtimeSession: Session,
    private readonly port: MessagePortMain
  ) {
    port.on("message", ({ data }) => this.messageListener?.(data))
    port.on("close", () => this.notifyClosed())
    window.on("closed", () => this.notifyClosed())
    window.webContents.on("render-process-gone", () => this.notifyClosed())
  }

  postMessage(message: unknown): void {
    if (this.closed || this.disposed) {
      throw new Error("Extension runtime transport is closed")
    }
    this.port.postMessage(message)
  }

  onMessage(listener: (message: unknown) => void): void {
    this.messageListener = listener
    if (!this.started && !this.closed && !this.disposed) {
      this.started = true
      // MessagePortMain queues messages until start(). Waiting until the
      // manager has installed its listener prevents a fast worker's initial
      // `ready` message from being dropped between factory creation and
      // runtime registration.
      this.port.start()
    }
  }

  onClose(listener: () => void): void {
    this.closeListener = listener
    if (this.closed) queueMicrotask(listener)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    try {
      this.port.close()
    } catch {
      // The renderer may have already closed the transferred port.
    }
    if (!this.window.isDestroyed()) this.window.destroy()
    void this.runtimeSession.clearStorageData().catch(() => undefined)
  }

  private notifyClosed(): void {
    if (this.closed || this.disposed) return
    this.closed = true
    this.closeListener?.()
  }
}

@Injectable()
export class ElectronFileExtensionRuntimeTransportFactory implements FileExtensionRuntimeTransportFactory {
  async create(
    options: CreateFileExtensionRuntimeTransportOptions
  ): Promise<FileExtensionRuntimeTransport> {
    const partition = `eidos-extension-runtime-${randomUUID()}`
    const runtimeSession = session.fromPartition(partition, { cache: false })
    denyAmbientCapabilities(runtimeSession)

    const runtimeWindow = new BrowserWindow({
      show: false,
      width: 1,
      height: 1,
      skipTaskbar: true,
      webPreferences: {
        session: runtimeSession,
        sandbox: true,
        nodeIntegration: false,
        nodeIntegrationInWorker: false,
        contextIsolation: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        devTools: false,
        spellcheck: false,
        backgroundThrottling: false,
        preload: path.join(__dirname, "file-extension-runtime-preload.cjs"),
      },
    })
    runtimeWindow.setMenuBarVisibility(false)
    runtimeWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }))

    try {
      await runtimeWindow.loadURL(extensionRuntimeDataUrl())
      runtimeWindow.webContents.on("will-navigate", (event) =>
        event.preventDefault()
      )
      const { port1, port2 } = new MessageChannelMain()
      runtimeWindow.webContents.postMessage(
        EXTENSION_RUNTIME_BOOTSTRAP_CHANNEL,
        {
          type: "eidos-extension-bootstrap",
          source: options.source,
          generation: options.generation,
        },
        [port1]
      )
      return new ElectronFileExtensionRuntimeTransport(
        runtimeWindow,
        runtimeSession,
        port2
      )
    } catch (error) {
      if (!runtimeWindow.isDestroyed()) runtimeWindow.destroy()
      void runtimeSession.clearStorageData().catch(() => undefined)
      throw error
    }
  }
}
