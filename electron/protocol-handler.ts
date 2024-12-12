import { EidosProtocolUrlChannelName } from '@/lib/const';
import { BrowserWindow } from 'electron';
import { log } from 'electron-log';

export interface ProtocolUrlPayload {
    url: string;
    action?: string;
    searchParams?: Record<string, string>;
}

export class ProtocolHandler {
    private mainWindow: BrowserWindow;
    private readonly PROTOCOL = 'eidos';

    constructor(window: BrowserWindow) {
        this.mainWindow = window;
    }

    handleUrl(url: string) {
        try {
            if (!url.startsWith(`${this.PROTOCOL}://`)) {
                throw new Error(`Invalid protocol: ${url.split(':')[0]}`);
            }

            const urlObj = new URL(url);
            const action = urlObj.hostname;
            const searchParams = Object.fromEntries(urlObj.searchParams);
            // convert vault to space
            if (searchParams.vault) {
                searchParams.space = searchParams.vault;
            } else {
                searchParams.space = "default"
            }
            const payload: ProtocolUrlPayload = {
                url: url,
                action: action,
                searchParams,
            };

            console.log('Main process sending protocol-url event:', payload);
            this.mainWindow.webContents.send(EidosProtocolUrlChannelName, payload);
            if (this.mainWindow.isMinimized()) {
                this.mainWindow.restore();
            }
            this.mainWindow.focus();

        } catch (error) {
            log('Error handling protocol URL:', error);
            throw error;
        }
    }
} 