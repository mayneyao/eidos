/**
 * Main Window Provider - Provides access to main BrowserWindow
 * Uses WindowService internally
 */

import type { BrowserWindow } from "electron"
import { Injectable, Inject } from "../../common/di"
import { WindowService } from "../window/window.service"

@Injectable()
export class MainWindowProvider {
  constructor(@Inject(WindowService) private windowService: WindowService) {}

  getWindow(): BrowserWindow | null {
    return this.windowService.getMainWindow()
  }
}
