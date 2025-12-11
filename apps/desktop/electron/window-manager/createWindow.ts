import type { WebContentsViewConstructorOptions } from 'electron';
import { BrowserWindow, ipcMain } from 'electron';
import os from "node:os";
import path from 'path';
import { getConfigManager } from '../config';
import { PORT } from '../main';
import { setupGeolocationHandler } from '../services/geolocation';
import { WindowManager } from './wm';
import { debounce } from '@/packages/lib/lodash';

const defaultViewOptions: WebContentsViewConstructorOptions = {
    webPreferences: {
        preload: path.join(__dirname, './preload.mjs'),
        nodeIntegration: true,
        contextIsolation: true,
        webviewTag: true,
        webSecurity: getConfigManager().get('security')?.webSecurity ?? true,
    }
}


export function createWindow(spaceId?: string) {
    const configManager = getConfigManager();
    const savedWindowState = configManager.get('windowState');

    let baseWindowConfig: Electron.BrowserWindowConstructorOptions = {
        width: savedWindowState?.width ?? 1440,
        height: savedWindowState?.height ?? 900,
        x: savedWindowState?.x,
        y: savedWindowState?.y,
        ...defaultViewOptions
    };

    const platform = process.platform;
    const isWindows11 = os.platform() === "win32" && os.release().startsWith("10.0.");

    // Platform-specific configurations
    switch (platform) {
        case "darwin":
            baseWindowConfig = {
                ...baseWindowConfig,
                titleBarStyle: "hiddenInset",
                trafficLightPosition: { x: 16, y: 10 },
                vibrancy: "under-window",
                visualEffectState: "active",
                transparent: true,
            };
            break;
        case "win32":
        case "linux":
            baseWindowConfig = {
                ...baseWindowConfig,
                // backgroundMaterial: isWindows11 ? "mica" : undefined,
                autoHideMenuBar: true,
                frame: false
            };
            break;
        default:
            baseWindowConfig = {
                ...baseWindowConfig,
            };
    }

    const win = new BrowserWindow(baseWindowConfig);
    const persistWindowState = () => {
        if (win.isDestroyed()) return;
        const bounds = win.isMaximized() ? win.getNormalBounds() : win.getBounds();
        configManager.set('windowState', {
            ...bounds,
            isMaximized: win.isMaximized(),
        });
    };

    // Create debounced version of persistWindowState for resize events
    const debouncedPersistWindowState = debounce(persistWindowState, 400);

    if (savedWindowState?.isMaximized) {
        win.maximize();
    }

    // Apply debouncing to resize events to prevent excessive state persistence
    win.on('resize', debouncedPersistWindowState);
    // Keep immediate persistence for move and close events
    win.on('move', persistWindowState);
    win.on('close', persistWindowState);
    const windowManager = new WindowManager(win)

    // Set up geolocation permission handler
    setupGeolocationHandler(win);

    ipcMain.handle('get-open-tabs', () => {
        return windowManager.tabs
    })

    if (spaceId) {
        if (process.env.VITE_DEV_SERVER_URL) {
            const devUrl = new URL(process.env.VITE_DEV_SERVER_URL);
            const devSubdomainUrl = `http://${spaceId}.eidos.localhost:${devUrl.port}/`;
            console.log(`🌐 Development mode: Loading subdomain URL: ${devSubdomainUrl}`);
            win.loadURL(devSubdomainUrl);
            win.webContents.openDevTools();
        } else {
            const prodSubdomainUrl = `http://${spaceId}.eidos.localhost:${PORT}/`;
            console.log(`🌐 Production mode: Loading subdomain URL: ${prodSubdomainUrl}`);
            win.loadURL(prodSubdomainUrl);
        }
    } else if (process.env.VITE_DEV_SERVER_URL) {
        console.log(`🌐 Loading window with Vite dev server URL: ${process.env.VITE_DEV_SERVER_URL}`);
        win.loadURL(process.env.VITE_DEV_SERVER_URL);
        win.webContents.openDevTools();
    } else {
        const localhostUrl = `http://localhost:${PORT}`;
        console.log(`🌐 Loading window with localhost URL: ${localhostUrl}`);
        win.loadURL(localhostUrl);
    }

    ipcMain.on('window-control', (_, action: string) => {
        switch (action) {
            case 'minimize':
                win.minimize()
                break
            case 'maximize':
                win.maximize()
                break
            case 'unmaximize':
                win.unmaximize()
                break
            case 'close':
                win.close()
                break
        }
    })

    win.on('maximize', () => win.webContents.send('window-state-changed', 'maximized'))
    win.on('unmaximize', () => win.webContents.send('window-state-changed', 'restored'))

    return win;
}

