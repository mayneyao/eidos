import type { BrowserWindow } from "electron"
import { globalShortcut } from "electron"

import { Injectable, Inject } from "../../common/di"
import { LoggerService } from "../logger/logger.service"
import type { WindowService } from "./window.service"

export interface ShortcutAction {
  id: string
  accelerator: string
  description?: string
}

export interface ShortcutHandler {
  (action: ShortcutAction): void
}

/**
 * Global Shortcuts Service
 * Manages global keyboard shortcuts that work across the entire application,
 * including when focus is in webview or iframe elements.
 */
@Injectable()
export class GlobalShortcutsService {
  private shortcuts: Map<string, ShortcutAction> = new Map()
  private isRegistered = false
  private isWindowFocused = false
  private windowService: WindowService | null = null

  constructor(@Inject(LoggerService) private logger: LoggerService) {}

  setWindowService(windowService: WindowService): void {
    this.windowService = windowService
    this.initializeShortcuts()
  }

  /**
   * Get the main window from window service
   */
  private get mainWindow(): BrowserWindow | null {
    return this.windowService?.getMainWindow() ?? null
  }

  /**
   * Initialize all global shortcuts
   */
  private initializeShortcuts() {
    // Define all shortcuts that should work globally
    const shortcuts: ShortcutAction[] = [
      {
        id: "new-tab",
        accelerator: "CommandOrControl+T",
        description: "Create new tab",
      },
      {
        id: "restore-last-closed-tab",
        accelerator: "CommandOrControl+Shift+T",
        description: "Restore last closed tab",
      },
      {
        id: "navigate-today",
        accelerator: "CommandOrControl+Shift+D",
        description: "Navigate to today",
      },
      {
        id: "create-new-doc",
        accelerator: "CommandOrControl+N",
        description: "Create new document",
      },
      {
        id: "toggle-theme",
        accelerator: "CommandOrControl+Shift+L",
        description: "Toggle theme",
      },
      {
        id: "toggle-ai-panel",
        accelerator: "CommandOrControl+Alt+\\",
        description: "Toggle AI panel",
      },
      {
        id: "toggle-sidebar",
        accelerator: "CommandOrControl+\\",
        description: "Toggle sidebar",
      },
      {
        id: "navigate-back",
        accelerator: "CommandOrControl+[",
        description: "Navigate back",
      },
      {
        id: "navigate-forward",
        accelerator: "CommandOrControl+]",
        description: "Navigate forward",
      },
      {
        id: "navigate-previous-day",
        accelerator: "CommandOrControl+Shift+[",
        description: "Navigate to previous day",
      },
      {
        id: "navigate-next-day",
        accelerator: "CommandOrControl+Shift+]",
        description: "Navigate to next day",
      },
      {
        id: "toggle-command-palette",
        accelerator: "CommandOrControl+K",
        description: "Toggle command palette",
      },
      {
        id: "toggle-global-search",
        accelerator: "CommandOrControl+P",
        description: "Toggle global search",
      },
      {
        id: "focus-address-bar",
        accelerator: "CommandOrControl+L",
        description: "Focus address bar",
      },
      {
        id: "find-in-page",
        accelerator: "CommandOrControl+F",
        description: "Find in page",
      },
      {
        id: "open-space-settings",
        accelerator: "CommandOrControl+,",
        description: "Open space settings",
      },
      {
        id: "copy-current-url",
        accelerator: "CommandOrControl+Shift+C",
        description: "Copy current URL",
      },
      {
        id: "toggle-terminal",
        accelerator: "Ctrl+`",
        description: "Toggle terminal panel",
      },
      // Tab management shortcuts
      {
        id: "close-current-tab",
        accelerator: "CommandOrControl+W",
        description: "Close current tab",
      },
      {
        id: "next-tab",
        accelerator: "Control+Tab",
        description: "Switch to next tab",
      },
      {
        id: "previous-tab",
        accelerator: "Control+Shift+Tab",
        description: "Switch to previous tab",
      },
    ]

    // Add shortcuts for switching sidebar tabs (Ctrl+1 through Ctrl+9)
    for (let i = 1; i <= 9; i++) {
      shortcuts.push({
        id: `switch-sidebar-tab-${i}`,
        accelerator: `CommandOrControl+${i}`,
        description: `Switch to sidebar tab ${i}`,
      })
    }

    // Register shortcuts
    shortcuts.forEach((shortcut) => {
      this.shortcuts.set(shortcut.accelerator, shortcut)
    })
  }

  /**
   * Setup window focus/blur event listeners
   */
  setupWindowFocusListeners(): void {
    const win = this.mainWindow
    if (!win) return

    win.on("focus", () => {
      this.logger.info("Window gained focus, registering global shortcuts")
      this.isWindowFocused = true
      this.registerShortcuts()
    })

    win.on("blur", () => {
      this.logger.info("Window lost focus, unregistering global shortcuts")
      this.isWindowFocused = false
      this.unregisterShortcuts()
    })

    // Check initial focus state
    if (win.isFocused()) {
      this.isWindowFocused = true
    }
  }

  /**
   * Register all global shortcuts
   */
  registerShortcuts(): boolean {
    if (this.isRegistered) {
      this.logger.info("Global shortcuts already registered")
      return true
    }

    // Only register shortcuts if window is focused
    if (!this.isWindowFocused) {
      this.logger.info(
        "Window not focused, skipping global shortcut registration"
      )
      return false
    }

    try {
      // Unregister any existing shortcuts first
      globalShortcut.unregisterAll()

      // Register each shortcut
      for (const [accelerator, action] of this.shortcuts) {
        const success = globalShortcut.register(accelerator, () => {
          this.logger.info(
            `Global shortcut activated: ${accelerator} -> ${action.id}`
          )
          this.handleShortcut(action)
        })

        if (!success) {
          this.logger.error(
            `Failed to register global shortcut: ${accelerator}`
          )
        }
      }

      this.isRegistered = true
      this.logger.info("Global shortcuts registered successfully")
      return true
    } catch (error) {
      this.logger.error("Failed to register global shortcuts:", error)
      return false
    }
  }

  /**
   * Unregister all global shortcuts
   */
  unregisterShortcuts(): void {
    globalShortcut.unregisterAll()
    this.isRegistered = false
    this.logger.info("Global shortcuts unregistered")
  }

  /**
   * Check if window is currently focused
   */
  getWindowFocusState(): boolean {
    return this.isWindowFocused
  }

  /**
   * Handle shortcut activation by sending message to renderer
   */
  private handleShortcut(action: ShortcutAction): void {
    const win = this.mainWindow
    if (!win || win.isDestroyed()) {
      this.logger.warn("Main window not available for shortcut handling")
      return
    }

    // Send message to renderer process
    win.webContents.send("global-shortcut-triggered", action)

    this.logger.info(`Global shortcut triggered: ${action.id}`)
  }

  /**
   * Check if shortcuts are registered
   */
  isShortcutsRegistered(): boolean {
    return this.isRegistered
  }

  /**
   * Get all registered shortcuts
   */
  getShortcuts(): ShortcutAction[] {
    return Array.from(this.shortcuts.values())
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.unregisterShortcuts()
  }
}

// Backward compatibility export
export { GlobalShortcutsService as GlobalShortcutManager }
