import path from 'path'
import { app, BrowserWindow } from 'electron'
import express from 'express';
import os from "node:os"
import { ipcMain } from 'electron';
import { DataSpace } from '@/worker/web-worker/DataSpace';
import { NodeServerDatabase } from './sqlite-server';
import { handleFunctionCall } from '@/apps/publish/lib/handleFunctionCall';

// Convert the URL to a local path

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



const server = express();
const PORT = 3000;

server.use(express.static(process.env.DIST));
server.use((req, res, next) => {
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    next();
});

server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));

if (!app.requestSingleInstanceLock()) {
    app.quit()
    process.exit(0)
}

let win: BrowserWindow | null


console.log(path.join(__dirname, './db.sqlite3'))
const serverDb = new NodeServerDatabase({
    path: path.join(__dirname, './db.sqlite3'),
});
const dataSpace = new DataSpace({
    db: serverDb as any,
    activeUndoManager: false,
    dbName: "read",
    context: {
        setInterval: undefined,
    },
});

ipcMain.handle('sqlite-msg', async (event, payload) => {
    const res = await handleFunctionCall(payload.data, dataSpace)
    return res
});


function createWindow() {
    let baseWindowConfig: Electron.BrowserWindowConstructorOptions = {
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, './preload.mjs'),
            nodeIntegration: true,
        }
    };

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
        win?.webContents.send('main-process-message', (new Date).toLocaleString())
    })

    if (process.env.VITE_DEV_SERVER_URL) {
        win.loadURL(process.env.VITE_DEV_SERVER_URL)
        win.webContents.openDevTools()
    } else {
        // win.loadFile('dist/index.html')
        // win.loadFile(path.join(process.env.DIST, 'index.html'))
        win.loadURL(`http://localhost:${PORT}`)
    }
}

app.on('window-all-closed', () => {
    app.quit()
    serverDb.close()
    win = null
})

app.whenReady().then(() => {
    createWindow()
    // ensure did-finish-load
    setTimeout(() => {
        // win?.webContents.send('main-process-message', `[better-sqlite3] ${JSON.stringify(db.pragma('journal_mode = WAL'))}`)
    }, 999)
})