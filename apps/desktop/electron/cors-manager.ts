import { session } from 'electron';
import { getConfigManager } from './config';

export class CorsManager {
    private static instance: CorsManager;
    private isInitialized = false;

    private constructor() { }

    public static getInstance(): CorsManager {
        if (!CorsManager.instance) {
            CorsManager.instance = new CorsManager();
        }
        return CorsManager.instance;
    }

    public initialize() {
        if (this.isInitialized) return;
        this.isInitialized = true;

        getConfigManager().on('configChanged', (data) => {
            if (data.key === 'security') {
                this.updateCorsSettings();
            }
        });

        this.updateCorsSettings();
    }

    private updateCorsSettings() {
        const securityConfig = getConfigManager().get('security');
        const domains = securityConfig.crossOriginDomains || [];
        const allDomains = [...domains, '*.eidos.localhost'];

        session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['*://*/*'] }, null);
        session.defaultSession.webRequest.onHeadersReceived({ urls: ['*://*/*'] }, null);

        if (allDomains.length === 0) return;

        const filter = { urls: allDomains.map(domain => `*://${domain}/*`) };

        session.defaultSession.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
            const url = new URL(details.url);
            // Skip RPC requests to allow proper CORS handling
            if (allDomains.some(domain => url.hostname.endsWith(domain.replace('*.', ''))) && !details.url.includes('/rpc')) {
                details.requestHeaders['Origin'] = '';
            }
            callback({ requestHeaders: details.requestHeaders });
        });

        session.defaultSession.webRequest.onHeadersReceived(filter, (details, callback) => {
            const url = new URL(details.url);
            // Skip proxy.eidos.localhost as it handles its own CORS
            if (url.hostname === 'proxy.eidos.localhost') {
                callback({ responseHeaders: details.responseHeaders });
                return;
            }

            // Skip sandbox domains - server-side CORS handling in server.ts
            if (url.hostname.startsWith('sandbox.') && url.hostname.endsWith('.eidos.localhost')) {
                callback({ responseHeaders: details.responseHeaders });
                return;
            }

            // Skip RPC requests to allow server-side CORS handling
            if (allDomains.some(domain => url.hostname.endsWith(domain.replace('*.', ''))) && !url.pathname.includes('/rpc')) {
                callback({
                    responseHeaders: {
                        ...details.responseHeaders,
                        'cross-origin-resource-policy': 'cross-origin',
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                        'Access-Control-Allow-Headers': '*',
                        'Access-Control-Allow-Credentials': 'true'
                    }
                });
            } else {
                callback({ responseHeaders: details.responseHeaders });
            }
        });
    }
}

export const corsManager = CorsManager.getInstance(); 