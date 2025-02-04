import { MsgType } from '@/lib/const';
import { handleFunctionCall } from '@/lib/rpc';
import { BrowserWindow, Menu, Tray, app, dialog, ipcMain, nativeImage, shell } from 'electron';
import { log } from 'electron-log';
import path from 'path';
import { getDataSpace, getOrSetDataSpace } from './data-space';
import { initializePlayground } from './file-system/manager';
import { ProtocolHandler } from './protocol-handler';
import { startServer } from './server/server';
import { AppUpdater } from './updater';
import { createWindow } from './window-manager/createWindow';
import { initApiAgent, getApiAgentStatus } from './server/api-agent';
import { getConfigManager } from './config';

export let win: BrowserWindow | null
let appUpdater: AppUpdater;
let tray: Tray | null
let protocolHandler: ProtocolHandler;

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


startServer({ dist: process.env.DIST, port: PORT });

if (!app.requestSingleInstanceLock()) {
    app.quit()
    process.exit(0)
}

ipcMain.handle('get-app-data-folder', () => {
    return getConfigManager().get('dataFolder');
});

ipcMain.handle('get-config', (event, key) => {
    return getConfigManager().get(key);
});

ipcMain.handle('set-config', (event, key, value) => {
    getConfigManager().set(key, value);
});

ipcMain.handle('get-user-config-path', () => {
    return path.join(app.getPath('userData'), 'config.json');
});

ipcMain.handle('sqlite-msg', async (event, payload) => {
    let dataSpace = getDataSpace()
    const { space, dbName } = payload.data
    const spaceId = space || dbName
    if (!dataSpace) {
        log('not found data space')
        const { space, dbName } = payload.data
        dataSpace = await getOrSetDataSpace(dbName || space)
        log('switch to data space', dataSpace.dbName)
    } else if (spaceId !== dataSpace.dbName) {
        log('switch to data space', dataSpace.dbName)
        dataSpace = await getOrSetDataSpace(dbName || space)
    }
    const res = await handleFunctionCall(payload.data, dataSpace)
    return res
});

ipcMain.handle(MsgType.SwitchDatabase, (event, args) => {
    const { databaseName, id } = args
    // Perform the database switch logic here
    const data = { dbName: databaseName } // Example response data
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

ipcMain.handle('open-folder', (event, folder) => {
    if (folder) {
        shell.openPath(folder)
            .then((result) => {
                if (result) {
                    log(`Error opening folder: ${result}`);
                } else {
                    log(`Folder opened successfully: ${folder}`);
                }
            })
            .catch((error) => {
                log(`Error opening folder: ${error}`);
            });
    } else {
        log('No folder path provided');
    }
});

ipcMain.handle('reload-app', () => {
    app.relaunch();
    win?.reload()
});

app.on('window-all-closed', () => {
    getDataSpace()?.closeDb()
    win = null
})


ipcMain.handle('check-for-updates', () => {
    appUpdater.checkForUpdates();
});

ipcMain.handle('quit-and-install', () => {
    appUpdater.quitAndInstall();
});

ipcMain.handle('initialize-playground', (event, space, blockId, files) => {
    return initializePlayground(space, blockId, files)
});


let forceQuit = false;

app.on('before-quit', () => {
    forceQuit = true;
});

function createTray() {
    if (process.platform === 'darwin') {
        return
    }
    try {
        const iconPath = path.join(process.env.VITE_PUBLIC, 'logo.png');
        log('Tray icon path:', iconPath);

        const icon = nativeImage.createFromPath(iconPath);
        tray = new Tray(icon);

        const contextMenu = Menu.buildFromTemplate([
            { label: 'show', click: () => win?.show() },
            { label: 'exit', click: () => { forceQuit = true; app.quit(); } }
        ]);

        tray.setToolTip('Eidos');
        tray.setContextMenu(contextMenu);

        log('Tray created successfully');
    } catch (error) {
        log('Error creating tray:', error);
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

app.on('open-url', (event, url) => {
    event.preventDefault();
    if (protocolHandler) {
        protocolHandler.handleUrl(url);
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

app.whenReady().then(() => {
    win = createWindow();
    const configManager = getConfigManager();

    configManager.on('configChanged', ({ key, newValue }: { key: string, newValue: unknown }) => {
        if (key === 'security') {
            console.log('security changed', newValue)
        }
    });
    createTray();

    protocolHandler = new ProtocolHandler(win);

    win.on('close', (event) => {
        if (!forceQuit) {
            if (process.platform === 'darwin') {
                event.preventDefault();
                win?.hide();
            } else {
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
});

app.on('activate', () => {
    if (win) {
        win.show();
    }
});

ipcMain.handle('quit-app', () => {
    forceQuit = true;
    destroyTray();
    app.quit();
});
