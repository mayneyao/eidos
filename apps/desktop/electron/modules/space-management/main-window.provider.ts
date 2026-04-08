/**
 * Main Window Provider - Provides access to main BrowserWindow
 * Similar to TerminalWindowProvider
 */

import { BrowserWindow } from "electron"
import { Injectable } from "../../common/di"

@Injectable()
export class MainWindowProvider {
  private windowGetter: (() => BrowserWindow | null) | null = null

  setWindowProvider(fn: () => BrowserWindow | null) {
    this.windowGetter = fn
  }

  getWindow(): BrowserWindow | null {
    return this.windowGetter ? this.windowGetter() : null
  }
}
