import path from 'path';
import { BrowserWindow, dialog, session } from 'electron';
import os from "node:os";
import { PORT } from './main';


export function createWindow() {
    let baseWindowConfig: Electron.BrowserWindowConstructorOptions = {
        width: 1440,
        height: 900,
        webPreferences: {
            preload: path.join(__dirname, './preload.mjs'),
            nodeIntegration: true,
        }
    };

    session.defaultSession.on('file-system-access-restricted', async (e, details, callback) => {
        const { origin, path } = details
        const { response } = await dialog.showMessageBox({
            message: `Are you sure you want ${origin} to open restricted path ${path}?`,
            title: 'File System Access Restricted',
            buttons: ['Choose a different folder', 'Allow', 'Cancel'],
            cancelId: 2
        })

        if (response === 0) {
            callback('tryAgain')
        } else if (response === 1) {
            callback('allow')
        } else {
            callback('deny')
        }
    })
    const platform = process.platform;
    const isWindows11 = os.platform() === "win32" && os.release().startsWith("10.0.");

    // Platform-specific configurations
    switch (platform) {
        case "darwin":
            baseWindowConfig = {
                ...baseWindowConfig,
                titleBarStyle: "hiddenInset",
                trafficLightPosition: { x: 18, y: 10 },
                vibrancy: "under-window",
                visualEffectState: "active",
                transparent: true,
            };
            break;
        case "win32":
            baseWindowConfig = {
                ...baseWindowConfig,
                titleBarStyle: "hidden",
                backgroundMaterial: isWindows11 ? "mica" : undefined,
                frame: true,
                maximizable: !isWindows11,
            };
            break;
        default:
            baseWindowConfig = {
                ...baseWindowConfig,
            };
    }

    const win = new BrowserWindow(baseWindowConfig);

    // Test active push message to Renderer-process.
    win.webContents.on('did-finish-load', () => {
        win?.webContents.send('main-process-message', (new Date).toLocaleString());
    });

    if (process.env.VITE_DEV_SERVER_URL) {
        win.loadURL(process.env.VITE_DEV_SERVER_URL);
        win.webContents.openDevTools();
    } else {
        // win.loadFile('dist/index.html')
        // win.loadFile(path.join(process.env.DIST, 'index.html'))
        win.loadURL(`http://localhost:${PORT}`);
    }
    return win
}
