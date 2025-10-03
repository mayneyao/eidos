import type { WebContentsViewConstructorOptions} from 'electron';
import { BrowserWindow, ipcMain } from 'electron';
import os from "node:os";
import path from 'path';
import { getConfigManager } from '../config';
import { PORT } from '../main';
import { setupGeolocationHandler } from '../services/geolocation';
import { WindowManager } from './wm';

const defaultViewOptions: WebContentsViewConstructorOptions = {
    webPreferences: {
        preload: path.join(__dirname, './preload.mjs'),
        nodeIntegration: true,
        contextIsolation: true,
        webviewTag: true,
        webSecurity: getConfigManager().get('security')?.webSecurity ?? true,
    }
}


export function createWindow(url?: string) {
    let baseWindowConfig: Electron.BrowserWindowConstructorOptions = {
        width: 1440,
        height: 900,
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
    const windowManager = new WindowManager(win)

    // Set up geolocation permission handler
    setupGeolocationHandler(win);

    ipcMain.handle('get-open-tabs', () => {
        return windowManager.tabs
    })

    if (url) {
        win.webContents.loadURL(url)
    } else if (process.env.VITE_DEV_SERVER_URL) {
        win.loadURL(process.env.VITE_DEV_SERVER_URL);
        win.webContents.openDevTools();
    } else {
        // win.loadFile('dist/index.html')
        // win.loadFile(path.join(process.env.DIST, 'index.html'))
        win.loadURL(`http://localhost:${PORT}`);
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

