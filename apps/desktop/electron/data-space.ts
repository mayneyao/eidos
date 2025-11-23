import { EidosDataEventChannelName, EidosMessageChannelName } from "@/lib/const";
import type { EidosDatabase } from "@/packages/core/data-space";
import { DataSpace } from "@/packages/core/data-space";
import { ExtensionTableName } from "@/packages/core/sqlite/const";
import { extractUDF, validateUDFCode } from "@eidos.space/v3";
import type { WebContents } from "electron";
import { ipcMain } from "electron";
import console from 'electron-log';
import { EventEmitter } from 'events';
import * as path from 'node:path';
import { getConfigManager } from "./config";
import { embedding } from "./data-space-context";
import { NodeExternalFileSystem } from './external-fs-node';
import { getSpaceDbPath } from "./file-system/space";
import { getSpaceRegistry } from "./space-registry";
import { getResourcePath } from "./helper";
import { win } from "./main";
import { NodeServerDatabase } from "./sqlite-server";


// --- START: Helper function to apply Graft Config to Environment --- 
function applyGraftConfigToEnv(): void {
    try {
        const configManager = getConfigManager();
        const isSyncEnabled = configManager.isSyncEnabled();
        const graftConfig = configManager.getGraftConfig();
        if (!isSyncEnabled) {
            console.log('Sync is disabled, skipping Graft config application');
            return;
        }
        console.log('Applying Graft config to environment variables:', graftConfig);

        // Only set env vars if the corresponding config value is present
        if (graftConfig.metastore) {
            process.env.GRAFT_METASTORE = graftConfig.metastore;
            console.log(`Set GRAFT_METASTORE=${graftConfig.metastore}`);
        }
        if (graftConfig.pagestore) {
            process.env.GRAFT_PAGESTORE = graftConfig.pagestore;
            console.log(`Set GRAFT_PAGESTORE=${graftConfig.pagestore}`);
        }
        if (graftConfig.token) { // Check if token exists
            process.env.GRAFT_TOKEN = graftConfig.token;
            console.log(`Set GRAFT_TOKEN=***`); // Avoid logging the actual token
        } else {
            // Ensure env var is unset if config value is missing/undefined
            delete process.env.GRAFT_TOKEN;
            console.log('Unset GRAFT_TOKEN');
        }
        // Always set autosync (default is true)
        process.env.GRAFT_AUTOSYNC = String(graftConfig.autosync);
        console.log(`Set GRAFT_AUTOSYNC=${graftConfig.autosync}`);

        if (graftConfig.clientId) { // Check if clientId exists
            process.env.GRAFT_CLIENT_ID = graftConfig.clientId;
            console.log(`Set GRAFT_CLIENT_ID=${graftConfig.clientId}`);
        } else {
            // Ensure env var is unset if config value is missing/undefined
            delete process.env.GRAFT_CLIENT_ID;
            console.log('Unset GRAFT_CLIENT_ID');
        }
        // GRAFT_DIR is not handled here as NodeServerDatabase manages the file path directly.
        // If the rust extension absolutely needs GRAFT_DIR, it might require further changes.

    } catch (error) {
        console.error('Failed to read graft config or set environment variables:', error);
        // Decide if this is fatal. For now, just log and continue.
    }
}
// --- END: Helper function --- 

function requestFromRenderer(webContents: WebContents, arg: any) {
    return new Promise((resolve, reject) => {
        const requestId = Math.random().toString(36).substr(2, 9);

        ipcMain.once(`response-${requestId}`, (event: any, result: any) => {
            resolve(result);
        });

        webContents.send('request-from-main', requestId, arg);
    });
}

async function initUDF(db: EidosDatabase) {
    try {
        // Check if ExtensionTableName table exists before querying it
        const tableExists = await db.selectObjects(
            `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
            [ExtensionTableName]
        );

        if (tableExists.length === 0) {
            console.warn(`Extension table ${ExtensionTableName} does not exist. Skipping UDF initialization.`);
            return;
        }

        // Query UDF extensions directly from database using the same SQL as getUDFExtensions
        const sql = `
            SELECT * FROM ${ExtensionTableName}
            WHERE type = ?
            AND meta IS NOT NULL
            AND meta != ''
            AND JSON_VALID(meta) = 1
            AND JSON_EXTRACT(meta, '$.type') = ?
            AND enabled = ?
        `;
        const params = ['script', 'udf', 1];

        const udfExtensions = await db.selectObjects(sql, params);

        for (const extension of udfExtensions) {
            const { code, name, id } = extension;

            try {
                // Validate UDF code format
                const validation = validateUDFCode(code);
                if (!validation.valid) {
                    console.error(`UDF validation failed for ${name} (${id}):`, validation.errors);
                    continue;
                }

                // Extract UDF using oxc-transform
                const udfResult = extractUDF(code);
                if (!udfResult) {
                    console.error(`Failed to extract UDF for ${name} (${id})`);
                    continue;
                }

                const { name: funcName, xFunc } = udfResult.createFunctionConfig;

                // Create function using the extracted configuration
                db.createFunction({
                    name: funcName,
                    xFunc: xFunc as any,
                });
                console.log(`Successfully loaded UDF: ${udfResult.createFunctionConfig.name} from extension ${name}`);

            } catch (error) {
                console.error(`Error loading UDF ${name} (${id}):`, error);
            }
        }
    } catch (error) {
        console.error('Error initializing UDFs:', error);
    }
}

/**
 * Create external file system for ~/ and @/ paths
 */
async function createExternalFileSystem(spaceId: string, db: EidosDatabase): Promise<NodeExternalFileSystem> {
    // Get project root directory from space registry
    const registry = getSpaceRegistry();
    const space = registry.getSpace(spaceId);

    if (!space) {
        throw new Error(`Space not found: ${spaceId}`);
    }

    const projectRoot = space.path; // This is the project root directory containing .eidos

    console.log(`Initializing external file system for space: ${spaceId}`);
    console.log(`Project root: ${projectRoot}`);

    return new NodeExternalFileSystem(async (fsPath: string) => {
        try {
            if (fsPath.startsWith('~/')) {
                // Project folder: ~/ maps to project root
                const relativePath = fsPath.substring(2);
                const absolutePath = path.join(projectRoot, relativePath);
                console.log(`Resolved ~/ path: ${fsPath} -> ${absolutePath}`);
                return absolutePath;
            }
            else if (fsPath.startsWith('@/')) {
                // Mounted folder: @/mountName/... maps to mounted path
                const parts = fsPath.substring(2).split('/');
                const mountName = parts[0];

                if (!mountName) {
                    console.error('Invalid mounted path: missing mount name');
                    return null;
                }

                // Get mount path from database
                const mountKey = `eidos:space:files:mount:${mountName}`;
                const mountRecords = await db.selectObjects(
                    `SELECT value FROM eidos__kv WHERE key = ?`,
                    [mountKey]
                );

                if (mountRecords.length === 0) {
                    console.warn(`Mount not found: ${mountName}`);
                    return null;
                }

                const mountPath = mountRecords[0].value as string;
                const relativePath = parts.slice(1).join('/');
                const absolutePath = relativePath
                    ? path.join(mountPath, relativePath)
                    : mountPath;

                console.log(`Resolved @/ path: ${fsPath} -> ${absolutePath}`);
                return absolutePath;
            }

            console.error(`Invalid path format: ${fsPath}. Must start with ~/ or @/`);
            return null;
        } catch (error) {
            console.error(`Error resolving path ${fsPath}:`, error);
            return null;
        }
    });
}


export class DataSpaceManager {
    private static instance: DataSpaceManager;
    private dataSpace: DataSpace | null = null;

    private constructor() { }

    public static getInstance(): DataSpaceManager {
        if (!DataSpaceManager.instance) {
            DataSpaceManager.instance = new DataSpaceManager();
        }
        return DataSpaceManager.instance;
    }

    public getDataSpace(): DataSpace | null {
        return this.dataSpace;
    }

    public async reload(): Promise<DataSpace | null> {
        if (!this.dataSpace) {
            return null;
        }

        const spaceName = this.dataSpace.dbName;
        // Close current dataspace
        this.dataSpace.close();
        this.dataSpace = null;

        // Reinitialize with the same space name
        return this.getOrSetDataSpace(spaceName);
    }

    public async close(): Promise<boolean> {
        if (!this.dataSpace) {
            return false;
        }

        // Close current dataspace
        this.dataSpace.close();
        this.dataSpace = null;
        return true;
    }

    public async getOrSetDataSpace(spaceId: string, enableSync: boolean = false, volumeId?: string): Promise<DataSpace> {
        if (this.dataSpace && this.dataSpace.dbName !== spaceId) {
            // Close both main and draft databases when switching to a different space
            this.dataSpace.close();
        } else if (this.dataSpace) {
            // If same space, return existing instance
            return this.dataSpace;
        }
        console.log("init space", spaceId)
        const libPath = getResourcePath(`dist-sqlite-ext/libsimple`);
        const dictPath = getResourcePath('dist-sqlite-ext/dict');
        const graftLibPath = getResourcePath('dist-sqlite-ext/libgraft');
        const vecLibPath = getResourcePath('dist-sqlite-ext/libvec');

        // --- START: Set Graft Environment Variables from Config ---
        applyGraftConfigToEnv(); // Call the helper function
        // --- END: Set Graft Environment Variables from Config ---

        const serverDb = new NodeServerDatabase({
            path: getSpaceDbPath(spaceId),
            options: {
                timeout: 3000,
            }
        }, {
            simple: {
                libPath,
                dictPath,
            },
            graft: {
                libPath: graftLibPath,
            },
            vec: {
                libPath: vecLibPath,
            },
            enableSync,
            volumeId,
            logger: console
        });

        const draftDataSpace = new DataSpace({
            db: new NodeServerDatabase({
                path: ':memory:',
            }, {
                simple: {
                    libPath,
                    dictPath,
                },
                enableSync: false,
                logger: console
            }),
            activeUndoManager: false,
            dbName: 'draft',
            context: {
                setInterval,
                embedding
            },
            hasLoadExtension: true,
            dataEventChannel: new BroadcastChannel('draft-data-event-channel')
        });

        // Create external file system for ~/ and @/ paths
        const externalFS = await createExternalFileSystem(spaceId, serverDb);

        const dataEventEmitter = new EventEmitter();

        const dataEventChannel = {
            name: EidosDataEventChannelName,
            postMessage: (data: any) => {
                win?.webContents.send(EidosDataEventChannelName, data);

                // delay to emit event to avoid query busy
                setTimeout(() => {
                    dataEventEmitter.emit('message', { data });
                }, 100)
            },
            set onmessage(handler: (event: { data: any }) => void) {
                dataEventEmitter.removeAllListeners('message');
                if (handler) {
                    dataEventEmitter.on('message', handler);
                }
            },
            onmessageerror: null,
            addEventListener: (type: string, listener: EventListener) => {
                dataEventEmitter.on(type, listener);
            },
            removeEventListener: (type: string, listener: EventListener) => {
                dataEventEmitter.off(type, listener);
            },
            dispatchEvent: (event: Event): boolean => {
                return dataEventEmitter.emit(event.type, event);
            },
            close: () => {
                dataEventEmitter.removeAllListeners('message');
            }
        };

        this.dataSpace = new DataSpace({
            db: serverDb,
            activeUndoManager: false,
            dbName: spaceId,
            context: {
                setInterval,
                embedding
            },
            createUDF: initUDF,
            hasLoadExtension: true,
            postMessage: (data: any, transfer?: any[]) => {
                win?.webContents.send(EidosMessageChannelName, data, transfer);
            },
            callRenderer: (type: any, data: any) => {
                return requestFromRenderer(win!.webContents, { type, data });
            },
            dataEventChannel: dataEventChannel,
            externalFS: externalFS,
            draftDb: draftDataSpace,
            enableFTS: true
        });
        this.dataSpace.initFileWatcher();
        return this.dataSpace;
    }
}


// Export convenience functions
export function getDataSpace(): DataSpace | null {
    return DataSpaceManager.getInstance().getDataSpace();
}

export function getOrSetDataSpace(spaceId: string, enableSync: boolean = false, volumeId?: string): Promise<DataSpace> {
    return DataSpaceManager.getInstance().getOrSetDataSpace(spaceId, enableSync, volumeId);
}

export function reloadDataSpace(): Promise<{ success: boolean }> {
    DataSpaceManager.getInstance().reload();
    return Promise.resolve({
        success: true
    });
}

export async function closeDataSpace(): Promise<{ success: boolean }> {
    const success = await DataSpaceManager.getInstance().close();
    return {
        success
    };
}
