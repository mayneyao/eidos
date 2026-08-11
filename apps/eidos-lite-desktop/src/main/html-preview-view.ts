import {
  BrowserWindow,
  session as electronSession,
  WebContentsView,
  type Event,
  type Input,
  type Session,
  type WebContents,
} from "electron"

import {
  EIDOS_SPACE_DOCUMENT_SCHEME,
  type HtmlPreviewBounds,
  type HtmlPreviewLayoutRequest,
  type HtmlPreviewOpenRequest,
} from "../shared/contracts"
import {
  htmlPreviewPartition,
  isHtmlPreviewUrlForRoot,
  serveDocumentPreview,
} from "./space/document-file-preview"

interface HtmlPreviewRecord {
  owner: WebContents
  previewId: string
  url: string
  window: BrowserWindow
  view: WebContentsView
  loaded: boolean
  visible: boolean
}

type BeforeInputHandler = (
  owner: WebContents,
  event: Event,
  input: Input
) => void

const allowedNetworkProtocols = new Set([
  `${EIDOS_SPACE_DOCUMENT_SCHEME}:`,
  "blob:",
  "data:",
  "https:",
  "wss:",
])

function allowedPreviewRequest(url: string): boolean {
  try {
    return allowedNetworkProtocols.has(new URL(url).protocol)
  } catch {
    return false
  }
}

function finiteCoordinate(value: number): number {
  if (!Number.isFinite(value)) throw new Error("Invalid HTML preview bounds")
  return Math.round(value)
}

function fittedBounds(
  window: BrowserWindow,
  bounds: HtmlPreviewBounds
): Electron.Rectangle {
  const [contentWidth, contentHeight] = window.getContentSize()
  const x = Math.max(0, Math.min(finiteCoordinate(bounds.x), contentWidth - 1))
  const y = Math.max(0, Math.min(finiteCoordinate(bounds.y), contentHeight - 1))
  const width = Math.max(
    1,
    Math.min(finiteCoordinate(bounds.width), contentWidth - x)
  )
  const height = Math.max(
    1,
    Math.min(finiteCoordinate(bounds.height), contentHeight - y)
  )
  return { x, y, width, height }
}

export class HtmlPreviewViewManager {
  private readonly records = new Map<number, HtmlPreviewRecord>()
  private readonly configuredSessions = new WeakSet<Session>()
  private readonly cleanupOwners = new Set<number>()

  constructor(private readonly beforeInput: BeforeInputHandler) {}

  async open(
    owner: WebContents,
    spaceRoot: string,
    request: HtmlPreviewOpenRequest
  ): Promise<void> {
    if (
      !request.previewId ||
      !isHtmlPreviewUrlForRoot(request.url, spaceRoot)
    ) {
      throw new Error("Invalid HTML preview")
    }
    const window = BrowserWindow.fromWebContents(owner)
    if (!window || window.isDestroyed()) {
      throw new Error("The preview window no longer exists")
    }
    const partition = htmlPreviewPartition(request.url)
    if (!partition) throw new Error("Invalid HTML preview session")

    this.close(owner)
    const previewSession = electronSession.fromPartition(partition, {
      cache: false,
    })
    this.configureSession(previewSession)
    const view = new WebContentsView({
      webPreferences: {
        session: previewSession,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        spellcheck: false,
      },
    })
    view.setBackgroundColor("#f7f7f5")
    view.setBounds(fittedBounds(window, request.bounds))
    view.setVisible(false)
    const record: HtmlPreviewRecord = {
      owner,
      previewId: request.previewId,
      url: request.url,
      window,
      view,
      loaded: false,
      visible: request.visible,
    }
    this.records.set(owner.id, record)
    this.attachOwnerCleanup(owner)
    this.configureWebContents(record)
    window.contentView.addChildView(view)

    try {
      await view.webContents.loadURL(request.url)
    } catch (error) {
      if (this.records.get(owner.id) === record) this.close(owner)
      throw error
    }
    if (this.records.get(owner.id) !== record) return
    record.loaded = true
    view.setVisible(record.visible)
  }

  layout(owner: WebContents, request: HtmlPreviewLayoutRequest): void {
    const record = this.records.get(owner.id)
    if (!record || record.previewId !== request.previewId) return
    record.visible = request.visible
    record.view.setBounds(fittedBounds(record.window, request.bounds))
    record.view.setVisible(record.loaded && request.visible)
    if (!request.visible && !record.owner.isDestroyed()) {
      record.owner.focus()
    }
  }

  async reload(owner: WebContents, previewId: string): Promise<void> {
    const record = this.records.get(owner.id)
    if (!record || record.previewId !== previewId) return
    record.loaded = false
    record.view.setVisible(false)
    await record.view.webContents.loadURL(record.url, {
      extraHeaders: "pragma: no-cache\n",
    })
    if (this.records.get(owner.id) !== record) return
    record.loaded = true
    record.view.setVisible(record.visible)
  }

  close(owner: WebContents, previewId?: string): void {
    const record = this.records.get(owner.id)
    if (!record || (previewId && record.previewId !== previewId)) return
    const restoreOwnerFocus = record.view.webContents.isFocused()
    this.records.delete(owner.id)
    if (!record.window.isDestroyed()) {
      record.window.contentView.removeChildView(record.view)
    }
    if (!record.view.webContents.isDestroyed()) {
      record.view.webContents.close()
    }
    if (restoreOwnerFocus && !record.owner.isDestroyed()) {
      record.owner.focus()
    }
  }

  closeAll(): void {
    for (const record of [...this.records.values()]) {
      this.close(record.owner)
    }
  }

  private configureSession(previewSession: Session): void {
    if (this.configuredSessions.has(previewSession)) return
    this.configuredSessions.add(previewSession)
    if (
      !previewSession.protocol.isProtocolHandled(EIDOS_SPACE_DOCUMENT_SCHEME)
    ) {
      previewSession.protocol.handle(EIDOS_SPACE_DOCUMENT_SCHEME, (request) =>
        serveDocumentPreview(request.url)
      )
    }
    previewSession.setPermissionCheckHandler(() => false)
    previewSession.setPermissionRequestHandler(
      (_webContents, _permission, reply) => reply(false)
    )
    previewSession.webRequest.onBeforeRequest((details, reply) =>
      reply({ cancel: !allowedPreviewRequest(details.url) })
    )
    previewSession.on("will-download", (event) => event.preventDefault())
  }

  private configureWebContents(record: HtmlPreviewRecord): void {
    const contents = record.view.webContents
    contents.setWindowOpenHandler(() => ({ action: "deny" }))
    contents.on("will-navigate", (event, url) => {
      if (url !== record.url) event.preventDefault()
    })
    contents.on("will-frame-navigate", (event) => {
      if (!event.isMainFrame) event.preventDefault()
    })
    contents.on("before-input-event", (event, input) =>
      this.beforeInput(record.owner, event, input)
    )
    contents.on("render-process-gone", () => {
      if (this.records.get(record.owner.id) === record) {
        record.loaded = false
        record.view.setVisible(false)
      }
    })
  }

  private attachOwnerCleanup(owner: WebContents): void {
    if (this.cleanupOwners.has(owner.id)) return
    this.cleanupOwners.add(owner.id)
    owner.once("destroyed", () => {
      this.close(owner)
      this.cleanupOwners.delete(owner.id)
    })
  }
}
