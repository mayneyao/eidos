/**
 * Main Window Provider - Provides access to main BrowserWindow
 * Uses setter injection to avoid circular dependencies
 */

import type { BrowserWindow } from "electron"
import { Injectable } from "../../common/di"
import type { WindowService } from "../window/window.service"

@Injectable()
export class MainWindowProvider {
  private windowService: WindowService | null = null

  setWindowService(windowService: WindowService): void {
    this.windowService = windowService
  }

  getWindow(): BrowserWindow | null {
    return this.windowService?.getMainWindow() ?? null
  }
}
