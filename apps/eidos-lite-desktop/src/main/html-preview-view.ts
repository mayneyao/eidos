import {
  session as electronSession,
  type Event,
  type Input,
  type Session,
  type WebContents,
} from "electron"
import {
  EIDOS_SPACE_DOCUMENT_SCHEME,
  IPC_CHANNELS,
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
  partition: string
  guest?: WebContents
  attach: (guest: WebContents) => void
}
const authorizedPreviews = new Map<number, HtmlPreviewRecord>()

// Every host denies guests unless the preview IPC has authorized this exact ticket.
export function installHtmlPreviewGuestGuard(owner: WebContents): void {
  owner.on("will-attach-webview", (event, preferences, params) => {
    const record = authorizedPreviews.get(owner.id)
    if (
      !record ||
      record.guest ||
      params.src !== record.url ||
      params.partition !== record.partition
    ) {
      event.preventDefault()
      return
    }
    delete preferences.preload
    Object.assign(preferences, {
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      nodeIntegrationInWorker: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      spellcheck: false,
    })
  })
  owner.on("did-attach-webview", (_event, guest) => {
    const record = authorizedPreviews.get(owner.id)
    if (!record || record.guest) {
      guest.close()
      return
    }
    record.guest = guest
    record.attach(guest)
  })
  owner.once("destroyed", () => authorizedPreviews.delete(owner.id))
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

export class HtmlPreviewViewManager {
  private readonly configuredSessions = new WeakSet<Session>()
  constructor(private readonly beforeInput: BeforeInputHandler) {}
  async open(
    owner: WebContents,
    spaceRoot: string,
    request: HtmlPreviewOpenRequest
  ): Promise<string> {
    if (!request.previewId || !isHtmlPreviewUrlForRoot(request.url, spaceRoot))
      throw new Error("Invalid HTML preview")
    const partition = htmlPreviewPartition(request.url)
    if (!partition) throw new Error("Invalid HTML preview session")
    this.close(owner)
    this.configureSession(
      electronSession.fromPartition(partition, { cache: false })
    )
    authorizedPreviews.set(owner.id, {
      owner,
      previewId: request.previewId,
      url: request.url,
      partition,
      attach: (guest) => {
        // Guest input does not bubble into the host DOM. Notify the host without
        // consuming the click, so menus dismiss and HTML controls still work.
        guest.on("before-mouse-event", (_event, mouse) => {
          if (mouse.type === "mouseDown" && !owner.isDestroyed()) {
            owner.send(IPC_CHANNELS.htmlPreviewPointerDown)
          }
        })
        guest.setWindowOpenHandler(() => ({ action: "deny" }))
        guest.on("will-navigate", (event, url) => {
          if (url !== request.url) event.preventDefault()
        })
        guest.on("will-redirect", (event) => event.preventDefault())
        guest.on("will-frame-navigate", (event) => {
          if (!event.isMainFrame) event.preventDefault()
        })
        guest.on("before-input-event", (event, input) =>
          this.beforeInput(owner, event, input)
        )
      },
    })
    return partition
  }
  async reload(owner: WebContents, previewId: string): Promise<void> {
    const record = authorizedPreviews.get(owner.id)
    if (
      record?.previewId === previewId &&
      record.guest &&
      !record.guest.isDestroyed()
    )
      record.guest.reloadIgnoringCache()
  }
  close(owner: WebContents, previewId?: string): void {
    const record = authorizedPreviews.get(owner.id)
    if (!record || (previewId && record.previewId !== previewId)) return
    authorizedPreviews.delete(owner.id)
    if (record.guest && !record.guest.isDestroyed()) record.guest.close()
  }
  closeAll(): void {
    for (const record of [...authorizedPreviews.values()])
      this.close(record.owner)
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
}
