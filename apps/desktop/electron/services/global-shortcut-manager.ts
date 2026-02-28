import type { BrowserWindow } from 'electron';
import { globalShortcut } from 'electron';

export interface ShortcutAction {
  id: string;
  accelerator: string;
  description?: string;
}

export interface ShortcutHandler {
  (action: ShortcutAction): void;
}

/**
 * Global Shortcut Manager
 * Manages global keyboard shortcuts that work across the entire application,
 * including when focus is in webview or iframe elements.
 */
export class GlobalShortcutManager {
  private shortcuts: Map<string, ShortcutAction> = new Map();
  private mainWindow: BrowserWindow | null = null;
  private isRegistered = false;
  private isWindowFocused = false;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
    this.initializeShortcuts();
    this.setupWindowFocusListeners();
  }

  /**
   * Initialize all global shortcuts
   */
  private initializeShortcuts() {
    // Define all shortcuts that should work globally
    const shortcuts: ShortcutAction[] = [
      {
        id: 'new-tab',
        accelerator: 'CommandOrControl+T',
        description: 'Create new tab'
      },
      {
        id: 'restore-last-closed-tab',
        accelerator: 'CommandOrControl+Shift+T',
        description: 'Restore last closed tab'
      },
      {
        id: 'navigate-today',
        accelerator: 'CommandOrControl+Shift+D',
        description: 'Navigate to today'
      },
      {
        id: 'create-new-doc',
        accelerator: 'CommandOrControl+N',
        description: 'Create new document'
      },
      {
        id: 'toggle-theme',
        accelerator: 'CommandOrControl+Shift+L',
        description: 'Toggle theme'
      },
      {
        id: 'toggle-ai-panel',
        accelerator: 'CommandOrControl+Alt+\\',
        description: 'Toggle AI panel'
      },
      {
        id: 'toggle-sidebar',
        accelerator: 'CommandOrControl+\\',
        description: 'Toggle sidebar'
      },
      {
        id: 'navigate-back',
        accelerator: 'CommandOrControl+[',
        description: 'Navigate back'
      },
      {
        id: 'navigate-forward',
        accelerator: 'CommandOrControl+]',
        description: 'Navigate forward'
      },
      {
        id: 'navigate-previous-day',
        accelerator: 'CommandOrControl+Shift+[',
        description: 'Navigate to previous day'
      },
      {
        id: 'navigate-next-day',
        accelerator: 'CommandOrControl+Shift+]',
        description: 'Navigate to next day'
      },
      {
        id: 'toggle-command-palette',
        accelerator: 'CommandOrControl+K',
        description: 'Toggle command palette'
      },
      {
        id: 'toggle-global-search',
        accelerator: 'CommandOrControl+P',
        description: 'Toggle global search'
      },
      {
        id: 'open-space-settings',
        accelerator: 'CommandOrControl+,',
        description: 'Open space settings'
      },
      {
        id: 'copy-current-url',
        accelerator: 'CommandOrControl+Shift+C',
        description: 'Copy current URL'
      },
      // Tab management shortcuts
      {
        id: 'close-current-tab',
        accelerator: 'CommandOrControl+W',
        description: 'Close current tab'
      },
      {
        id: 'next-tab',
        accelerator: 'Control+Tab',
        description: 'Switch to next tab'
      },
      {
        id: 'previous-tab',
        accelerator: 'Control+Shift+Tab',
        description: 'Switch to previous tab'
      },
    ];

    // Add shortcuts for switching sidebar tabs (Ctrl+1 through Ctrl+9)
    for (let i = 1; i <= 9; i++) {
      shortcuts.push({
        id: `switch-sidebar-tab-${i}`,
        accelerator: `CommandOrControl+${i}`,
        description: `Switch to sidebar tab ${i}`
      });
    }

    // Register shortcuts
    shortcuts.forEach(shortcut => {
      this.shortcuts.set(shortcut.accelerator, shortcut);
    });
  }

  /**
   * Setup window focus/blur event listeners
   */
  private setupWindowFocusListeners() {
    if (!this.mainWindow) return;

    this.mainWindow.on('focus', () => {
      // console.log('Window gained focus, registering global shortcuts');
      this.isWindowFocused = true;
      this.registerShortcuts();
    });

    this.mainWindow.on('blur', () => {
      // console.log('Window lost focus, unregistering global shortcuts');
      this.isWindowFocused = false;
      this.unregisterShortcuts();
    });

    // Check initial focus state
    if (this.mainWindow.isFocused()) {
      this.isWindowFocused = true;
    }
  }

  /**
   * Register all global shortcuts
   */
  public registerShortcuts(): boolean {
    if (this.isRegistered) {
      console.log('Global shortcuts already registered');
      return true;
    }

    // Only register shortcuts if window is focused
    if (!this.isWindowFocused) {
      console.log('Window not focused, skipping global shortcut registration');
      return false;
    }

    try {
      // Unregister any existing shortcuts first
      globalShortcut.unregisterAll();

      // Register each shortcut
      for (const [accelerator, action] of this.shortcuts) {
        const success = globalShortcut.register(accelerator, () => {
          console.log(`Global shortcut activated: ${accelerator} -> ${action.id}`);
          this.handleShortcut(action);
        });

        if (!success) {
          console.error(`Failed to register global shortcut: ${accelerator}`);
        } else {
          // console.log(`Successfully registered global shortcut: ${accelerator} -> ${action.id}`);
        }
      }

      this.isRegistered = true;
      // console.log('Global shortcuts registered successfully');
      return true;
    } catch (error) {
      console.error('Failed to register global shortcuts:', error);
      return false;
    }
  }

  /**
   * Unregister all global shortcuts
   */
  public unregisterShortcuts(): void {
    globalShortcut.unregisterAll();
    this.isRegistered = false;
    console.log('Global shortcuts unregistered');
  }

  /**
   * Check if window is currently focused
   */
  public getWindowFocusState(): boolean {
    return this.isWindowFocused;
  }

  /**
   * Handle shortcut activation by sending message to renderer
   */
  private handleShortcut(action: ShortcutAction): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      console.warn('Main window not available for shortcut handling');
      return;
    }

    // Send message to renderer process
    this.mainWindow.webContents.send('global-shortcut-triggered', action);

    console.log(`Global shortcut triggered: ${action.id}`);
  }

  /**
   * Check if shortcuts are registered
   */
  public isShortcutsRegistered(): boolean {
    return this.isRegistered;
  }

  /**
   * Get all registered shortcuts
   */
  public getShortcuts(): ShortcutAction[] {
    return Array.from(this.shortcuts.values());
  }

  /**
   * Update main window reference (useful when window is recreated)
   */
  public setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
    this.setupWindowFocusListeners();
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    this.unregisterShortcuts();
    this.mainWindow = null;
  }
}
