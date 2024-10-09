import { autoUpdater } from 'electron-updater';
import { BrowserWindow } from 'electron';
import log from 'electron-log';

export class AppUpdater {
    constructor(private mainWindow: BrowserWindow) {
        log.transports.file.level = 'info';
        autoUpdater.logger = log;

        autoUpdater.allowPrerelease = true;

        this.setupAutoUpdater();
    }

    private setupAutoUpdater() {
        autoUpdater.on('checking-for-update', () => {
            log.info('Checking for update...');
            this.sendStatusToWindow('checking');
        });

        autoUpdater.on('update-available', (info) => {
            log.info('Update available.', info);
            this.sendStatusToWindow('available', info);
        });

        autoUpdater.on('update-not-available', (info) => {
            log.info('Update not available.', info);
            this.sendStatusToWindow('not-available', info);
        });

        autoUpdater.on('error', (err) => {
            log.error('Error in auto-updater. ', err);
            this.sendStatusToWindow('error', err);
        });

        autoUpdater.on('download-progress', (progressObj) => {
            let logMessage = `Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent}% (${progressObj.transferred}/${progressObj.total})`;
            log.info(logMessage);
            this.sendStatusToWindow('progress', progressObj);
        });

        autoUpdater.on('update-downloaded', (info) => {
            log.info('Update downloaded', info);
            this.sendStatusToWindow('downloaded', info);
            this.notifyUpdateReady(info);
        });
    }

    private sendStatusToWindow(status: string, data?: any) {
        this.mainWindow?.webContents.send('update-status', status, data);
    }

    private notifyUpdateReady(info: any) {
        this.mainWindow?.webContents.send('update-ready', info);
    }

    public checkForUpdates() {
        autoUpdater.checkForUpdatesAndNotify();
    }

    public quitAndInstall() {
        autoUpdater.quitAndInstall();
    }
}