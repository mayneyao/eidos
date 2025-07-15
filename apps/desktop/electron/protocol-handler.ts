import { EidosProtocolUrlChannelName } from '@/lib/const';
import type { BrowserWindow } from 'electron';
import { log } from 'electron-log';

export interface ProtocolUrlPayload {
    url: string;
    action?: string;
    searchParams?: Record<string, string>;
    extensionId?: string;
}

export class ProtocolHandler {
    private mainWindow: BrowserWindow;
    private readonly PROTOCOL = 'eidos';

    constructor(window: BrowserWindow) {
        this.mainWindow = window;
    }

    handleUrl(url: string) {
        console.log('Handling URL:', url);
        try {
            if (!url.startsWith(`${this.PROTOCOL}://`)) {
                throw new Error(`Invalid protocol: ${url.split(':')[0]}`);
            }

            const urlObj = new URL(url);
            const action = urlObj.hostname;
            const searchParams = Object.fromEntries(urlObj.searchParams);

            // Handle block action specifically
            if (action === 'block') {
                this.handleBlockAction(urlObj, url);
                return;
            }

            // Handle extension action
            // eidos://extension/extensionId
            if (action === 'extension') {
                this.handleExtensionAction(urlObj, url, searchParams);
                return;
            }
            // Handle regular eidos protocol actions
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


    private handleExtensionAction(urlObj: URL, originalUrl: string, searchParams: Record<string, string>) {
        const pathParts = urlObj.pathname.split('/').filter(part => part);
        if (pathParts.length === 0) {
            throw new Error(`Invalid extension URL format, missing extension ID: ${originalUrl}`);
        }
        const extensionId = pathParts[0];
        const payload: ProtocolUrlPayload = {
            url: originalUrl,
            action: 'extension',
            extensionId: extensionId,
            searchParams: searchParams,
        };
        console.log('Main process sending protocol-url event (extension):', payload);
        this.mainWindow.webContents.send(EidosProtocolUrlChannelName, payload);
        if (this.mainWindow.isMinimized()) {
            this.mainWindow.restore();
        }
        this.mainWindow.focus();
        return; // Exit after handling extension
    }

    private handleBlockAction(urlObj: URL, originalUrl: string) {
        try {
            // Format: eidos://block/blockid@databaseName?params
            const pathParts = urlObj.pathname.split('/').filter(part => part);

            if (pathParts.length === 0) {
                throw new Error(`Invalid block URL format, missing block ID: ${originalUrl}`);
            }

            const blockInfoPart = pathParts[0];
            const blockInfo = blockInfoPart.split('@');

            if (blockInfo.length !== 2) {
                throw new Error(`Invalid block ID format, expected blockid@database: ${blockInfoPart}`);
            }

            const blockId = blockInfo[0];
            const database = blockInfo[1];

            // Create URL to the standalone blocks page
            const currentUrl = this.mainWindow.webContents.getURL();
            const currentUrlObj = new URL(currentUrl);
            // Only keep the origin part (protocol + hostname + port)
            // // now the url change to <extensionId>.block.<spaceId>.eidos.localhost:13127/
            // const standaloneBlockUrl = new URL(`${blockId}.block.${database}.eidos.localhost:13127`);
            const baseUrl = currentUrlObj.origin + '/';
            // Format should be /:space/standalone-blocks/:id
            const standaloneBlockUrl = new URL(`${baseUrl}${database}/standalone-blocks/${blockId}`);
            // Copy any additional search parameters
            urlObj.searchParams.forEach((value, key) => {
                standaloneBlockUrl.searchParams.append(key, value);
            });

            // Open the URL in a new window using shell.openExternal or window.open
            console.log('Opening standalone block URL in new window:', standaloneBlockUrl.toString());
            this.mainWindow.webContents.executeJavaScript(`window.open('${standaloneBlockUrl.toString()}', '_blank')`);

            // Focus the main window
            if (this.mainWindow.isMinimized()) {
                this.mainWindow.restore();
            }
            this.mainWindow.focus();
        } catch (error) {
            log('Error handling block action:', error);
            throw error;
        }
    }
} 