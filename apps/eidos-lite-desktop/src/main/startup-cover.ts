import { WebContentsView, type BrowserWindow } from "electron"
import { startupDocument } from "./startup-document"

/** Keep a painted logo above the workbench across document navigations. */
export class StartupCover {
  private readonly view = new WebContentsView({
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  private readonly contents = this.view.webContents
  private disposed = false
  private revealing = false

  constructor(private readonly window: BrowserWindow) {
    window.contentView.addChildView(this.view)
    this.resize()
    window.on("resize", this.resize)
    window.once("closed", this.dispose)
  }

  load(locale: string): Promise<void> {
    return this.contents.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(startupDocument(locale))}`
    )
  }

  async reveal(): Promise<void> {
    if (this.disposed || this.revealing) return
    this.revealing = true
    try {
      // The renderer signals after painting. Wait for its compositor surface
      // as well, while the independently painted cover stays visible.
      await this.window.webContents.capturePage()
    } finally {
      this.dispose()
    }
  }

  private readonly resize = () => {
    if (this.disposed || this.window.isDestroyed()) return
    const { width, height } = this.window.getContentBounds()
    this.view.setBounds({ x: 0, y: 0, width, height })
  }

  readonly dispose = () => {
    if (this.disposed) return
    this.disposed = true
    this.window.removeListener("resize", this.resize)
    this.window.removeListener("closed", this.dispose)
    if (!this.window.isDestroyed())
      this.window.contentView.removeChildView(this.view)
    if (!this.contents.isDestroyed()) this.contents.close()
  }
}
