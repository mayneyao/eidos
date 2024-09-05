import path from 'path'
import { app, BrowserWindow } from 'electron'
import { fileURLToPath } from 'url'
import express from 'express';

// Convert the URL to a local path
const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

function createWindow() {
    win = new BrowserWindow({
        icon: path.join(process.env.VITE_PUBLIC, 'logo.svg'),
        webPreferences: {
            preload: path.join(__dirname, './preload.mjs'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    })

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
    win = null
})

app.whenReady().then(() => {
    createWindow()
    // ensure did-finish-load
    setTimeout(() => {
        // win?.webContents.send('main-process-message', `[better-sqlite3] ${JSON.stringify(db.pragma('journal_mode = WAL'))}`)
    }, 999)
})