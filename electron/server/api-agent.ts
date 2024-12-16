import { handleFunctionCall } from '@/lib/rpc';
import { getUuid } from '@/lib/utils';
import { log } from 'electron-log';
import WebSocket, { RawData } from 'ws';
import { getOrSetDataSpace } from '../data-space';
import { z } from 'zod';
import { getConfigManager } from '../config';
import { BrowserWindow } from 'electron';

let wss: WebSocket | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 3000; // 3 seconds

let currentConfig: {
    enabled: boolean;
    url: string;
} | null = null;

export type ApiAgentStatus = {
    connected: boolean;
    enabled: boolean;
    url: string | null;
    lastError?: string;
    reconnectAttempts: number;
};

let status: ApiAgentStatus = {
    connected: false,
    enabled: false,
    url: null,
    reconnectAttempts: 0
};

function updateStatus(newStatus: Partial<ApiAgentStatus>) {
    status = { ...status, ...newStatus };
    BrowserWindow.getAllWindows().forEach(window => {
        window.webContents.send('api-agent-status-changed', status);
    });
}

const msgSchema = z.object({
    id: z.string(),
    data: z.object({
        space: z.string(),
        method: z.string(),
        params: z.array(z.any()),
        userId: z.string().optional(),
    }),
});

type IMsg = z.infer<typeof msgSchema>;

function deserializeMsg(str: string): IMsg {
    try {
        const res = JSON.parse(str);
        return msgSchema.parse(res);
    } catch (error) {
        throw new Error("Invalid message format");
    }
}

export function initApiAgent() {
    const configManager = getConfigManager();
    const apiConfig = configManager.get('apiAgentConfig');

    currentConfig = apiConfig;
    startApiAgent(apiConfig);

    configManager.on('configChanged', ({ key, newValue }) => {
        if (key === 'apiAgentConfig') {
            if (JSON.stringify(currentConfig) !== JSON.stringify(newValue)) {
                console.log('API Agent config changed, restarting...');
                stopApiAgentServer();
                currentConfig = newValue;
                startApiAgent(newValue);
            }
        }
    });
}

export function startApiAgent({ enabled, url }: {
    enabled: boolean;
    url: string;
}): WebSocket | null {
    if (!enabled) {
        log('API Agent is disabled');
        updateStatus({ enabled: false, connected: false, url: null });
        return null;
    }

    updateStatus({ enabled, url });

    function connect() {
        try {
            let _url = url;
            if (url.startsWith('https://')) {
                _url = url.replace('https://', 'wss://').replace('rpc', 'websocket');

            }

            log('Attempting to connect to:', _url);

            wss = new WebSocket(_url, {
                followRedirects: true,
                handshakeTimeout: 10000,
                maxPayload: 100 * 1024 * 1024, // 100MB
            });

            wss.onopen = () => {
                log('Connected to API Agent WebSocket server');
                reconnectAttempts = 0;
                updateStatus({ connected: true, reconnectAttempts: 0 });
            }

            wss.on('message', async (message: RawData) => {
                log('Received message:', message.toString());
                try {
                    const msg = deserializeMsg(message.toString());
                    const { id, data } = msg;
                    const { space, method, params } = data;

                    const dataSpace = await getOrSetDataSpace(space);
                    const result = await handleFunctionCall({
                        method,
                        params,
                        space,
                        dbName: space,
                        userId: data.userId || 'unknown'
                    }, dataSpace);

                    if (wss?.readyState === WebSocket.OPEN) {
                        const response = {
                            id,
                            data: {
                                success: true,
                                data: result
                            }
                        };
                        log('Sending response:', response);
                        wss.send(JSON.stringify(response));
                    }
                } catch (error: unknown) {
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    if (wss?.readyState === WebSocket.OPEN) {
                        const errorResponse = {
                            id: getUuid(),
                            data: {
                                success: false,
                                error: errorMessage
                            }
                        };
                        log('Sending error response:', errorResponse);
                        wss.send(JSON.stringify(errorResponse));
                    }
                    log('Error handling message:', error);
                }
            });

            wss.on('close', (code: number, reason: Buffer) => {
                const reasonStr = reason.toString() || 'No reason provided';
                log(`WebSocket closed with code ${code}. Reason: ${reasonStr}`);
                updateStatus({
                    connected: false,
                    lastError: `Connection closed: ${reasonStr}`,
                    reconnectAttempts
                });

                if (code === 1000) {
                    log('Connection closed normally');
                    return;
                }

                if (enabled && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                    reconnectAttempts++;
                    const delay = RECONNECT_DELAY * Math.pow(2, reconnectAttempts - 1); // Exponential backoff
                    log(`Attempting to reconnect (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}) in ${delay}ms...`);
                    setTimeout(connect, delay);
                } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
                    log('Max reconnection attempts reached. Giving up.');
                }
            });

            wss.on('error', (error: Error) => {
                log('WebSocket connection error:', error);
                updateStatus({
                    connected: false,
                    lastError: error.message
                });
                if ('code' in error) {
                    log('Error code:', (error as any).code);
                }
                if ('message' in error) {
                    log('Error message:', error.message);
                }
            });

            const pingInterval = setInterval(() => {
                if (wss?.readyState === WebSocket.OPEN) {
                    wss.ping(() => { });
                } else {
                    clearInterval(pingInterval);
                }
            }, 30000); // Send ping every 30 seconds

            return wss;
        } catch (error) {
            log('Failed to create WebSocket client:', error);
            return null;
        }
    }

    return connect();
}

export function stopApiAgentServer() {
    reconnectAttempts = MAX_RECONNECT_ATTEMPTS;
    updateStatus({
        connected: false,
        enabled: false,
        reconnectAttempts
    });
    if (wss) {
        wss.close(1000, 'Closing connection');
        wss = null;
    }
}

export function getApiAgentStatus(): ApiAgentStatus {
    return { ...status };
}
