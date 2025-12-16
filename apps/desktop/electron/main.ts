import { MsgType } from '@/lib/const';
import { BrowserWindow } from 'electron';
import { Menu, Tray, app, dialog, ipcMain, nativeImage, shell, webContents } from 'electron';
import electronLog from 'electron-log';
import path from 'path';
import fs from 'fs/promises';
import { getConfigManager } from './config';
import { CredentialsManager } from './credentials';
import { corsManager } from './cors-manager';
import { closeDataSpace, DataSpaceManager, getDataSpace, getOrSetDataSpace, reloadDataSpace } from './data-space';
import { cleanupPlaygroundWatchers, initializePlayground } from './file-system/playground';
import { getResourcePath } from './helper';
import { ProtocolHandler } from './protocol-handler';
import { getApiAgentStatus, initApiAgent } from './server/api-agent';
import { startServer } from './server/server';
import { AppUpdater } from './updater';
import { createWindow } from './window-manager/createWindow';
import { WorkerManager } from './worker-manager';
import { GlobalShortcutManager } from './services/global-shortcut-manager';
import console from 'electron-log';
import { fetchAvailableModels } from '@/packages/ai/helper';
import { migrateFromLegacyConfig, getSpaceRegistry } from './space-registry';
import { initGraftDatabase } from './sync/init';
import { EchoServerHandler } from '@eidos.space/echo/server';
import type { EchoMessage } from '@eidos.space/echo';


process.on('uncaughtException', (error) => {
    console.error('Unhandled Exception:', error); // Also log to console
    electronLog.error('Unhandled Exception:', error);
    // Consider showing an error dialog here in production
    // dialog.showErrorBox('Unhandled Exception', error.message);
    // app.quit(); // Ensure exit on error
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    electronLog.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Consider showing an error dialog here in production
    // dialog.showErrorBox('Unhandled Rejection', `${reason}`);
    // app.quit();
});

export let win: BrowserWindow | null
let appUpdater: AppUpdater;
let tray: Tray | null
let protocolHandler: ProtocolHandler;
let globalShortcutManager: GlobalShortcutManager | null = null;
let forceQuit = false;

export const PORT = 13127;



const libPath = getResourcePath(`dist-sqlite-ext/libsimple`);
const dictPath = getResourcePath('dist-sqlite-ext/dict');

const simplePathConfig = {
    libPath,
    dictPath
}

const vecPath = getResourcePath(`dist-sqlite-ext/libvec`);
const vecPathConfig = {
    libPath: vecPath,
}

const graftPath = getResourcePath(`dist-sqlite-ext/libgraft`);
const graftPathConfig = {
    libPath: graftPath,
}

process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true'
// The built directory structure
//
// ├─┬ dist
// │ ├─┬ electron
// │ │ ├── main.js
// │ │ └── preload.js
// │ ├── index.html
// │ ├── ...other-static-files-from-public
// │
process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged
    ? process.env.DIST
    : path.join(process.env.DIST, '../public')

// app.setName('Eidos')
// not working on windows, we just change name in package.json to eidos to avoid breaking change
// app.setPath('userData', path.join(app.getPath('appData'), 'eidos'))

startServer({ dist: process.env.DIST, port: PORT });

if (!app.requestSingleInstanceLock()) {
    app.quit()
    process.exit(0)
}

// Set up window open handler when webview DOM is ready
// Prevents webview from opening new windows inside the app, redirects external links to system browser
ipcMain.on('webview-dom-ready', (_, id) => {
    const wc = webContents.fromId(id)
    wc?.setWindowOpenHandler(({ url }) => {
        const protocol = (new URL(url)).protocol
        // Only allow http and https protocol external links to open in system browser
        if (['https:', 'http:'].includes(protocol)) {
            shell.openExternal(url)
        }
        // Deny other types of window open requests to maintain app security
        return { action: 'deny' }
    })
})

ipcMain.handle('get-app-data-folder', () => {
    return getConfigManager().get('dataFolder');
});

ipcMain.handle('get-config', (event, key) => {
    return getConfigManager().get(key);
});

ipcMain.handle('set-config', (event, key, value) => {
    getConfigManager().set(key, value);
});

ipcMain.handle('get-ai-config', () => {
    return getConfigManager().get('ai');
});

ipcMain.handle('get-user-config-path', () => {
    return path.join(app.getPath('userData'), 'config.json');
});

// Cache for Echo server handlers (one per space)
const echoHandlers = new Map<string, EchoServerHandler>();

ipcMain.handle('sqlite-msg', async (event, payload: EchoMessage) => {
    const startTime = Date.now();
    const requestId = payload.id.substring(-8);
    
    try {
        console.log(`[${requestId}] START: ${payload.data.method}`);
        const { space, dbName } = payload.data
        const spaceId = space || dbName

        if (!spaceId) {
            console.error(`[${requestId}] Missing space ID for method:`, payload.data.method);
            console.error(`[${requestId}] Payload data keys:`, Object.keys(payload.data));
            console.error(`[${requestId}] Full payload.data:`, JSON.stringify(payload.data, null, 2));
            throw new Error('No space ID provided in sqlite-msg');
        }

        let dataSpace = getDataSpace()
        
        if (!dataSpace) {
            electronLog.info('not found data space')
            dataSpace = await getOrSetDataSpace(spaceId)
            electronLog.info('switch to data space', dataSpace.dbName)
        } else if (spaceId !== dataSpace.dbName) {
            electronLog.info('switch to data space', spaceId)
            dataSpace = await getOrSetDataSpace(spaceId)
        }

        if (!dataSpace) {
            throw new Error('Failed to initialize data space');
        }

        // Get or create Echo server handler for this space
        if (!echoHandlers.has(spaceId)) {
            echoHandlers.set(spaceId, new EchoServerHandler(dataSpace));
        }
        const handler = echoHandlers.get(spaceId)!;

        console.log(`[${requestId}] Handler ready, elapsed: ${Date.now() - startTime}ms`);

        // For Electron IPC, we need to capture the response as Echo message format
        let responseMessage: EchoMessage | null = null;
        let isIterator = false;

        // Create a port adapter for Electron IPC
        const iteratorChannel = `sqlite-iterator-${payload.id}`;
        const portAdapter = {
            postMessage: (message: EchoMessage) => {
                console.log(`[${requestId}] postMessage called, type: ${message.type}, elapsed: ${Date.now() - startTime}ms`);
                // For iterator messages, send via IPC channel
                if (message.type === 'IteratorValue' || message.type === 'IteratorDone' || message.type === 'IteratorError') {
                    isIterator = true;
                    event.sender.send(iteratorChannel, message);
                } 
                // For regular responses or errors, capture the entire message
                else {
                    responseMessage = message;
                }
            },
            addEventListener: (type: string, listener: any) => {
                // Listen for cancel messages
                if (type === 'message') {
                    const cancelChannel = `sqlite-iterator-cancel-${payload.id}`;
                    ipcMain.on(cancelChannel, (_event, data) => {
                        listener({ data });
                    });
                }
            },
        };

        console.log(`[${requestId}] Calling handler.handle()...`);
        // Handle the message using Echo's server handler
        await handler.handle(payload, portAdapter as any);
        console.log(`[${requestId}] handler.handle() completed, elapsed: ${Date.now() - startTime}ms`);

        // Return the appropriate response in Echo message format
        if (isIterator) {
            // For iterators, the client expects this special marker
            console.log(`[${requestId}] Returning iterator marker, elapsed: ${Date.now() - startTime}ms`);
            return { __isIterator: true, channel: iteratorChannel };
        }
        
        // Return the Echo message (with type, id, data)
        console.log(`[${requestId}] COMPLETE: Returning response, total time: ${Date.now() - startTime}ms`);
        return responseMessage;
    } catch (error) {
        console.error(`[${requestId}] ERROR after ${Date.now() - startTime}ms:`, error);
        throw error;
    }
});


ipcMain.handle('sqlite-msg-read', async (event, payload) => {

    const credentials = await CredentialsManager.getSyncCredentials('eidos.space');
    if (!credentials) {
        throw new Error(`Credentials for eidos.space not found`);
    }
    const { space, dbName } = payload.data
    const spaceId = space || dbName
    const spaceInfo = getSpaceRegistry().getSpace(spaceId);
    if (!spaceInfo) {
        throw new Error(`Space ${spaceId} not found`);
    }
    // return WorkerManager.getInstance().executeTask(payload, {
    //     simplePathConfig,
    //     vecPathConfig,
    //     spaceInfo,
    //     graftPathConfig: {} as any,
    // });
});


ipcMain.handle(MsgType.SwitchDatabase, (event, args) => {
    const { databaseName, id } = args
    // Perform the database switch logic here
    const data = { dbName: databaseName } // Example response data
    getOrSetDataSpace(databaseName)
    return { id, data }
})

ipcMain.handle(MsgType.Pull, async (event, args) => {
    const { spaceName } = args
    const dataSpace = await getOrSetDataSpace(spaceName)
    return dataSpace?.pull()
})

ipcMain.handle(MsgType.Push, async (event, args) => {
    const { spaceName } = args
    const dataSpace = await getOrSetDataSpace(spaceName)
    return dataSpace?.push()
})

ipcMain.handle(MsgType.Fetch, async (event, args) => {
    const { spaceName } = args
    const dataSpace = await getOrSetDataSpace(spaceName)
    return dataSpace?.fetch()
})

ipcMain.handle(MsgType.Hydrate, async (event, args) => {
    const { spaceName } = args
    const dataSpace = await getOrSetDataSpace(spaceName)
    return dataSpace?.hydrate()
})

ipcMain.handle(MsgType.Snapshot, async (event, args) => {
    const { spaceName } = args
    const dataSpace = await getOrSetDataSpace(spaceName)
    return dataSpace?.snapshot()
})
ipcMain.handle(MsgType.Status, async (event, args) => {
    const { spaceName } = args
    const dataSpace = await getOrSetDataSpace(spaceName)
    return dataSpace?.status()
})

ipcMain.handle(MsgType.Volumes, async (event, args) => {
    const { spaceName } = args
    const dataSpace = await getOrSetDataSpace(spaceName)
    return dataSpace?.volumes()
})


ipcMain.handle(MsgType.CreateSpace, async (event, args) => {
    const { spaceName, enableSync, volumeId } = args
    const data = { spaceName }
    const dataSpace = await getOrSetDataSpace(spaceName)
    if (dataSpace) {
        return { data, success: true }
    } else {
        return { data, success: false }
    }
})

ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog({
        properties: ['openDirectory']
    });

    if (result.canceled) {
        return undefined;
    } else {
        return result.filePaths[0];
    }
});

ipcMain.handle('show-in-file-manager', async (event, path) => {
    if (path) {
        try {
            const stats = await fs.stat(path);
            if (stats.isFile()) {
                shell.showItemInFolder(path);
            } else {
                shell.openPath(path);
            }
        } catch (error) {
            electronLog.error('Error accessing path:', error);
            return { success: false, error: 'Failed to access path' };
        }
    } else {
        electronLog.warn('No path provided');
        return { success: false, error: 'No path provided' };
    }
    return { success: true };
});

ipcMain.handle('open-url', async (event, url) => {
    if (!url || typeof url !== 'string') {
        electronLog.warn('Invalid URL provided');
        return { success: false, error: 'Invalid URL provided' };
    }

    try {
        await shell.openExternal(url);
        electronLog.info(`URL opened successfully: ${url}`);
        return { success: true };
    } catch (error) {
        electronLog.error(`Error opening URL: ${error}`);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
});

ipcMain.handle('reload-app', () => {
    // Reinitialize global shortcuts after reload
    if (win && globalShortcutManager) {
        globalShortcutManager.setMainWindow(win);
        // GlobalShortcutManager will handle registration based on focus state
    }
    app.relaunch();
    win?.reload()
});

app.on('window-all-closed', () => {
    cleanupPlaygroundWatchers();
    WorkerManager.getInstance().shutdown();
    getDataSpace()?.close();
    globalShortcutManager?.destroy();
    globalShortcutManager = null;
    win = null;
})


ipcMain.handle('check-for-updates', () => {
    appUpdater.checkForUpdatesManually();
});

ipcMain.handle('quit-and-install', () => {
    forceQuit = true;
    appUpdater.quitAndInstall();
});

ipcMain.handle('initialize-playground', (event, space, blockId, files) => {
    return initializePlayground(space, blockId, files)
});

// Credentials management
ipcMain.handle('set-sync-credentials', async (event, credentials, providerId) => {
    return CredentialsManager.setSyncCredentials(credentials, providerId);
});

ipcMain.handle('get-sync-credentials', async (event, providerId) => {
    return CredentialsManager.getSyncCredentials(providerId);
});

ipcMain.handle('clear-sync-credentials', async (event, providerId) => {
    return CredentialsManager.clearSyncCredentials(providerId);
});

ipcMain.handle('has-sync-credentials', async (event, providerId) => {
    return CredentialsManager.hasSyncCredentials(providerId);
});




app.on('before-quit', () => {
    cleanupPlaygroundWatchers();
    forceQuit = true;
});

function createTray() {
    if (process.platform === 'darwin') {
        return
    }
    try {
        const iconPath = path.join(process.env.VITE_PUBLIC || '', 'logo.png');
        electronLog.info('Tray icon path:', iconPath);

        const icon = nativeImage.createFromPath(iconPath);
        tray = new Tray(icon);

        const contextMenu = Menu.buildFromTemplate([
            { label: 'show', click: () => win?.show() },
            { label: 'exit', click: () => { forceQuit = true; app.quit(); } }
        ]);

        tray.setToolTip('Eidos');
        tray.setContextMenu(contextMenu);

        electronLog.info('Tray created successfully');
    } catch (error) {
        electronLog.error('Error creating tray:', error);
    }
}

function destroyTray() {
    if (tray) {
        tray.destroy();
        tray = null;
    }
}

if (process.defaultApp) {
    if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient('eidos', process.execPath, [path.resolve(process.argv[1])])
    }
} else {
    app.setAsDefaultProtocolClient('eidos')
}

// Queue for protocol URLs received before app is ready
let pendingProtocolUrl: string | null = null;

app.on('open-url', (event, url) => {
    event.preventDefault();
    console.log('Received protocol URL:', url);

    if (protocolHandler && win) {
        // App is ready, handle immediately
        protocolHandler.handleUrl(url);
    } else {
        // App not ready yet, queue the URL
        console.log('App not ready, queuing protocol URL');
        pendingProtocolUrl = url;
    }
});

app.on('second-instance', (event, commandLine) => {
    const protocolUrl = commandLine.find(arg => arg.startsWith('eidos://'));
    if (protocolUrl && protocolHandler) {
        protocolHandler.handleUrl(protocolUrl);
    }

    if (win) {
        if (win.isMinimized()) win.restore();
        win.focus();
    }
});

/**
 * Extract spaceId from protocol URL if it's an open-space action
 */
function extractSpaceIdFromProtocolUrl(url: string): string | null {
    try {
        const urlObj = new URL(url);
        if (urlObj.hostname === 'open-space' && urlObj.searchParams.has('space')) {
            return urlObj.searchParams.get('space');
        }
    } catch (error) {
        console.error('Failed to parse protocol URL:', error);
    }
    return null;
}

app.whenReady().then(async () => {
    corsManager.initialize();

    await migrateFromLegacyConfig();

    const registry = getSpaceRegistry();
    const configManager = getConfigManager();

    // Check if app was launched with a protocol URL
    let launchProtocolUrl: string | null = null;
    let spaceIdFromProtocol: string | null = null;

    // Check for pending URL from macOS 'open-url' event
    if (pendingProtocolUrl) {
        launchProtocolUrl = pendingProtocolUrl;
        spaceIdFromProtocol = extractSpaceIdFromProtocolUrl(pendingProtocolUrl);
        console.log('Found pending protocol URL:', pendingProtocolUrl, '-> spaceId:', spaceIdFromProtocol);
    }

    // Check for protocol URL in command line args (Windows/Linux)
    if (!launchProtocolUrl && process.platform !== 'darwin') {
        const protocolUrl = process.argv.find(arg => arg.startsWith('eidos://'));
        if (protocolUrl) {
            launchProtocolUrl = protocolUrl;
            spaceIdFromProtocol = extractSpaceIdFromProtocolUrl(protocolUrl);
            console.log('Found protocol URL in argv:', protocolUrl, '-> spaceId:', spaceIdFromProtocol);
        }
    }

    // Determine which space to open
    let spaceId: string | undefined;

    if (spaceIdFromProtocol) {
        // Protocol URL takes precedence - validate it exists
        if (registry.validateSpace(spaceIdFromProtocol)) {
            spaceId = spaceIdFromProtocol;
            console.log('Opening space from protocol URL:', spaceId);
            // Update last opened space
            configManager.setLastOpenedSpace(spaceId);
        } else {
            console.warn(`Space from protocol URL not found: ${spaceIdFromProtocol}`);
            // Fall back to last opened or first space
            spaceId = configManager.getLastOpenedSpace();
        }
    } else {
        // Normal startup - use last opened space
        spaceId = configManager.getLastOpenedSpace();
    }

    // Fallback to first available space if needed
    if (!spaceId) {
        const firstSpace = registry.getFirstSpace();
        spaceId = firstSpace?.id;

        if (spaceId) {
            configManager.setLastOpenedSpace(spaceId);
        }
    }

    // Validate the final space selection
    if (spaceId && !registry.validateSpace(spaceId)) {
        console.warn(`Space ${spaceId} is invalid, falling back to first available space`);
        const firstSpace = registry.getFirstSpace();
        spaceId = firstSpace?.id;
        if (spaceId) {
            configManager.setLastOpenedSpace(spaceId);
        }
    }

    // Create window with the determined spaceId
    win = createWindow(spaceId);

    // Initialize global shortcut manager (will register shortcuts when window gains focus)
    globalShortcutManager = new GlobalShortcutManager(win);

    configManager.on('configChanged', ({ key, newValue }: { key: string, newValue: unknown }) => {
        if (key === 'security') {
            console.log('security changed', newValue)
        }
    });
    createTray();

    protocolHandler = new ProtocolHandler(win);

    // If there was a launch protocol URL that wasn't just open-space,
    // handle it after window loads (for other protocol actions like extension install)
    if (launchProtocolUrl && !spaceIdFromProtocol) {
        console.log('Processing non-open-space protocol URL:', launchProtocolUrl);
        pendingProtocolUrl = null;

        win.webContents.once('did-finish-load', () => {
            protocolHandler?.handleUrl(launchProtocolUrl);
        });
    } else {
        // Clear the pending URL since we've already handled it by opening the right space
        pendingProtocolUrl = null;
    }

    win.on('close', (event) => {
        if (!forceQuit) {
            if (process.platform === 'darwin') {
                event.preventDefault();
                win?.hide();
            } else {
                cleanupPlaygroundWatchers();
                forceQuit = true;
                destroyTray();
                app.quit();
            }
        }
    });
    appUpdater = new AppUpdater(win);
    appUpdater.checkForUpdates();
    initApiAgent();

    ipcMain.handle('get-api-agent-status', () => {
        return getApiAgentStatus();
    });

    ipcMain.handle('list-spaces', () => {
        const registry = getSpaceRegistry();
        return registry.getAllSpaces();
    });

    ipcMain.handle('switch-space', async (_, spaceId: string) => {
        const registry = getSpaceRegistry();
        const space = registry.getSpace(spaceId);

        if (!space) {
            throw new Error(`Space not found: ${spaceId}`);
        }

        const configManager = getConfigManager();
        configManager.setLastOpenedSpace(spaceId);

        if (win) {
            if (process.env.VITE_DEV_SERVER_URL) {
                const devUrl = new URL(process.env.VITE_DEV_SERVER_URL);
                const devSubdomainUrl = `http://${spaceId}.eidos.localhost:${devUrl.port}/`;
                console.log(`🔄 Switching to space in development mode: ${devSubdomainUrl}`);
                win.loadURL(devSubdomainUrl);
            } else {
                const prodSubdomainUrl = `http://${spaceId}.eidos.localhost:${PORT}/`;
                console.log(`🔄 Switching to space in production mode: ${prodSubdomainUrl}`);
                win.loadURL(prodSubdomainUrl);
            }
        }

        return { success: true };
    });

    ipcMain.handle('register-space', async (_, spacePath: string, options:{
        customName?: string,
        remoteUrl?: string,
    } = {}) => {
        const registry = getSpaceRegistry();
        try {
            const space = registry.registerSpace(spacePath, {
                customName: options.customName,
                remoteUrl: options.remoteUrl,
            });
            return { success: true, space };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('remove-space', async (_, spaceId: string) => {
        const registry = getSpaceRegistry();
        const success = registry.removeSpace(spaceId);
        return { success };
    });

    ipcMain.handle('get-current-space', () => {
        const configManager = getConfigManager();
        const spaceId = configManager.getLastOpenedSpace();
        if (!spaceId) {
            return null;
        }

        const registry = getSpaceRegistry();
        return registry.getSpace(spaceId);
    });

    ipcMain.handle('init-graft-database', async (_, spaceId: string) => {
        return await initGraftDatabase(spaceId);
    });

    ipcMain.handle('get-sync-status', () => {
        const dataSpace = getDataSpace();
        if (!dataSpace) {
            return { enabled: false };
        }

        // Type assertion since we know dataSpace.db is NodeServerDatabase in desktop
        const db = dataSpace.db as any;
        return { enabled: db.isSyncEnabled || false };
    });

    ipcMain.handle('update-space', async (_, spaceId: string, updates: { name?: string }) => {
        const registry = getSpaceRegistry();
        try {
            const success = registry.updateSpace(spaceId, updates);
            if (success) {
                return { success: true };
            } else {
                return { success: false, error: 'Space not found' };
            }
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    });
});

app.on('activate', () => {
    if (win) {
        win.show();
    }
});

ipcMain.handle('quit-app', () => {
    cleanupPlaygroundWatchers();
    forceQuit = true;
    destroyTray();
    getDataSpace()?.close();
    app.quit();
});

ipcMain.handle('reload-query-worker', async () => {
    console.log('prepare for import')
    // Importing CSV will enable exclusive locks, causing read-only sqlite worker queries to timeout. We directly shut down all workers before importing CSV
    WorkerManager.getInstance().shutdown();
    return { success: true };
});

ipcMain.handle('reload-data-space', async () => {
    return reloadDataSpace();
});

ipcMain.handle('close-data-space', async () => {
    return closeDataSpace();
});

// Simple fetch proxy - just forward to Node.js fetch (no CORS restrictions)
ipcMain.handle('fetch', async (_, url, options) => {
    const res = await fetch(url, options);
    const body = await res.arrayBuffer();

    return {
        ok: res.ok,
        status: res.status,
        statusText: res.statusText,
        headers: Object.fromEntries(res.headers.entries()),
        url: res.url,
        body: body
    };
});

ipcMain.handle('fetch-available-models', async (event, apiKey: string, providerType: string, baseUrl?: string) => {
    try {
        const models = await fetchAvailableModels(apiKey, providerType as any, baseUrl);
        return { success: true, models };
    } catch (error) {
        console.error('Error fetching available models:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
});

// Native context menu handling
ipcMain.handle('show-native-context-menu', async (event, options: { items: NativeMenuItem[], x?: number, y?: number }) => {
    try {
        const { items, x, y } = options;

        // Convert menu items to Electron menu template with click handlers
        const menuTemplate = convertToElectronMenuTemplateWithIds(items);

        // Create and show the menu
        const menu = Menu.buildFromTemplate(menuTemplate);

        // Get the window from the event sender
        const window = BrowserWindow.fromWebContents(event.sender);
        if (!window) {
            throw new Error('Cannot find window from event sender');
        }

        // Show the menu at the specified position or at cursor
        if (x !== undefined && y !== undefined) {
            menu.popup({
                window,
                x: Math.round(x),
                y: Math.round(y),
                callback: () => {
                    // Menu closed - cleanup if needed
                }
            });
        } else {
            menu.popup({
                window,
                callback: () => {
                    // Menu closed - cleanup if needed
                }
            });
        }

        return { success: true };
    } catch (error) {
        console.error('Error showing native context menu:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
});

// Helper function to convert menu items with IDs for click handling
function convertToElectronMenuTemplateWithIds(items: NativeMenuItem[]): Electron.MenuItemConstructorOptions[] {
    return items.map((item, index) => {
        if (item.type === 'separator') {
            return {
                type: 'separator' as const,
            }
        }

        if (item.type === 'submenu') {
            return {
                label: item.label,
                enabled: item.enabled ?? true,
                submenu: convertToElectronMenuTemplateWithIds(item.submenu),
                icon: item.icon,
                click: item.id ? () => {
                    // Send click event back to renderer with the item ID
                    const focusedWindow = BrowserWindow.getFocusedWindow();
                    if (focusedWindow) {
                        focusedWindow.webContents.send('native-menu-click', item.id);
                    }
                } : undefined,
            }
        }

        // For text, checkbox, and radio items
        const baseItem = {
            label: item.label,
            enabled: item.enabled ?? true,
            accelerator: (item as any).accelerator,
            icon: (item as any).icon,
            click: item.id ? () => {
                // Send click event back to renderer with the item ID
                const focusedWindow = BrowserWindow.getFocusedWindow();
                if (focusedWindow) {
                    focusedWindow.webContents.send('native-menu-click', item.id);
                }
            } : undefined,
        };

        if (item.type === 'checkbox') {
            return {
                ...baseItem,
                type: 'checkbox' as const,
                checked: item.checked ?? false,
            };
        }

        if (item.type === 'radio') {
            return {
                ...baseItem,
                type: 'radio' as const,
                checked: item.checked ?? false,
            };
        }

        // Default text item
        return baseItem;
    });
}

