import { MsgType } from '@/lib/const';
import { handleFunctionCall } from '@/lib/rpc';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'path';
import { getDataSpace, getOrSetDataSpace } from './data-space';
import { startServer } from './server/server';
import { createWindow } from './window-manager/createWindow';
import { getAppConfig } from './config';
import { log } from 'electron-log';
import { AppUpdater } from './updater';

export let win: BrowserWindow | null

let appUpdater: AppUpdater;

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

ipcMain.handle('get-user-config-path', () => {
    return path.join(app.getPath('userData'), 'config.json');
});

ipcMain.handle('sqlite-msg', async (event, payload) => {
    let dataSpace = getDataSpace()
    if (!dataSpace) {
        log('not found data space')
        const { space, dbName } = payload.data
        dataSpace = await getOrSetDataSpace(dbName || space)
        log('switch to data space', dataSpace.dbName)
    } else {
        log('get data space', dataSpace.dbName)
    }
    const res = await handleFunctionCall(payload.data, dataSpace)
    return res
});

ipcMain.handle(MsgType.SwitchDatabase, (event, args) => {
    const { databaseName, id } = args
    // Perform the database switch logic here
    const data = { dbName: databaseName } // Example response data
    log('switch-database', databaseName)
    getOrSetDataSpace(databaseName)
    return { id, data }
})

ipcMain.handle(MsgType.CreateSpace, (event, args) => {
    const { spaceName } = args
    const data = { spaceName }
    getOrSetDataSpace(spaceName)
    return { data }
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

ipcMain.handle('reload-app', () => {
    app.relaunch();
    win?.reload()
});

app.on('window-all-closed', () => {
    app.quit()
    getDataSpace()?.closeDb()
    win = null
})


ipcMain.handle('check-for-updates', () => {
    appUpdater.checkForUpdates();
});

ipcMain.handle('quit-and-install', () => {
    appUpdater.quitAndInstall();
});

app.whenReady().then(() => {
    win = createWindow()
    appUpdater = new AppUpdater(win);
    appUpdater.checkForUpdates();
    // ensure did-finish-load
    setTimeout(() => {
        // win?.webContents.send('main-process-message', `[better-sqlite3] ${JSON.stringify(db.pragma('journal_mode = WAL'))}`)
    }, 999)
})