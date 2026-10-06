import { BrowserWindow, Notification, dialog } from "electron"
import type { PeerPairingRequest } from "./peer-service"

// One owner in the main process; renderer polling never creates alerts.
export class PairingPrompt {
  private active?: {
    id: string
    abort: AbortController
    timer: ReturnType<typeof setTimeout>
    notification?: Notification
  }
  private lastId?: string
  constructor(
    private readonly decide: (allow: boolean, id: string) => Promise<unknown>,
    private readonly openWindow?: () => BrowserWindow
  ) {}

  update(request: PeerPairingRequest | null) {
    if (
      request &&
      (request.id === this.lastId || request.expires <= Date.now())
    )
      return
    this.clear()
    if (!request) return
    this.lastId = request.id
    const abort = new AbortController()
    const active = {
      id: request.id,
      abort,
      timer: setTimeout(() => this.clear(), request.expires - Date.now()),
      notification: undefined as Notification | undefined,
    }
    this.active = active
    let parent =
      BrowserWindow.getFocusedWindow() ??
      BrowserWindow.getAllWindows().find((window) => !window.isDestroyed())
    let dialogShown = false
    const showDialog = () => {
      if (!parent || dialogShown || this.active !== active) return
      dialogShown = true
      void dialog
        .showMessageBox(parent, {
          type: "question",
          title: "Eidos Lite · 设备配对",
          message: `允许“${name}”连接这台电脑？`,
          detail:
            "仅在这是你刚刚扫码的设备时接受。接受后，此设备可以同步你在「设置 → 设备」中开放的 Space。手机正在等待你的决定；配对码在生成后 5 分钟过期。",
          buttons: ["拒绝", "接受"],
          defaultId: 0,
          cancelId: 0,
          noLink: true,
          signal: abort.signal,
        })
        .then(async ({ response }) => {
          if (
            this.active !== active ||
            abort.signal.aborted ||
            request.expires <= Date.now()
          )
            return
          this.clear()
          await this.decide(response === 1, request.id)
        })
        .catch(() => {
          if (this.active === active) this.clear()
        })
    }
    const name = request.name.replace(/[\r\n\u0000-\u001f\u007f]/g, " ")
    if (Notification.isSupported()) {
      // Let the OS own the single light sound and respect notification/Focus settings.
      const notification = new Notification({
        title: "Eidos Lite · 设备配对请求",
        body: `“${name}” 正在等待电脑授权。请在 Eidos Lite 中接受或拒绝。`,
        silent: false,
      })
      active.notification = notification
      notification.on("click", () => {
        if (this.active !== active) return
        if (!parent || parent.isDestroyed()) {
          parent = this.openWindow?.()
          dialogShown = false
        }
        if (!parent) return
        if (parent.isMinimized()) parent.restore()
        parent.show()
        parent.focus()
        showDialog()
      })
      notification.show()
    }
    // A parent enables cancellation on macOS; never raise a background window.
    // With no window, retain the Settings authorization entry rather than blocking
    // the main process in a non-cancellable macOS application-modal dialog.
    showDialog()
  }
  private clear() {
    const active = this.active
    this.active = undefined
    if (!active) return
    clearTimeout(active.timer)
    active.abort.abort()
    active.notification?.close()
  }
}
