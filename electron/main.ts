import { MsgType } from '@/lib/const';
import { handleFunctionCall } from '@/lib/rpc';
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { createWindow } from './createWindow';
import { dataSpace, getOrSetDataSpace } from './data-space';
import { checkAndPromptForFolder } from './file-system/config';
import { startServer } from './server/server';
import { getAppConfig } from './file-system/config';

let win: BrowserWindow | null

export const PORT = 13127;

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

startServer({ dist: process.env.DIST, port: PORT })


if (!app.requestSingleInstanceLock()) {
    app.quit()
    process.exit(0)
}

ipcMain.handle('get-app-config', () => {
    return getAppConfig();
});

ipcMain.handle('sqlite-msg', async (event, payload) => {
    const res = await handleFunctionCall(payload.data, dataSpace)
    return res
});

ipcMain.handle(MsgType.SwitchDatabase, (event, args) => {
    const { databaseName, id } = args
    // Perform the database switch logic here
    const data = { dbName: databaseName } // Example response data
    console.log('switch-database', databaseName)
    getOrSetDataSpace(databaseName)
    return { id, data }
})

ipcMain.handle(MsgType.CreateSpace, (event, args) => {
    const { spaceName } = args
    const data = { spaceName }
    getOrSetDataSpace(spaceName)
    return { data }
})


app.on('window-all-closed', () => {
    app.quit()
    dataSpace?.closeDb()
    win = null
})

app.whenReady().then(() => {
    win = createWindow()
    checkAndPromptForFolder(win)
    // ensure did-finish-load
    setTimeout(() => {
        // win?.webContents.send('main-process-message', `[better-sqlite3] ${JSON.stringify(db.pragma('journal_mode = WAL'))}`)
    }, 999)
})