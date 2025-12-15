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
import { CredentialsManager } from "./credentials";
import { embedding } from "./data-space-context";
import { NodeExternalFileSystem } from './external-fs-node';
import { getSpaceDbPath, getSpacePath } from "./file-system/space";
import { getResourcePath } from "./helper";
import { win } from "./main";
import { getSpaceRegistry } from "./space-registry";
import { NodeServerDatabase } from "./sqlite-server";


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

    return new NodeExternalFileSystem(
        async (fsPath: string) => {
            try {
                if (fsPath.startsWith('~/')) {
                    // Project folder: ~/ maps to project root
                    const relativePath = fsPath.substring(2);
                    const absolutePath = path.join(projectRoot, relativePath);
                    // console.log(`Resolved ~/ path: ${fsPath} -> ${absolutePath}`);
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

                    // console.log(`Resolved @/ path: ${fsPath} -> ${absolutePath}`);
                    return absolutePath;
                }

                console.error(`Invalid path format: ${fsPath}. Must start with ~/ or @/`);
                return null;
            } catch (error) {
                console.error(`Error resolving path ${fsPath}:`, error);
                return null;
            }
        },
        async () => {
            try {
                const mounts = await db.selectObjects(
                    `SELECT key, value FROM eidos__kv WHERE key LIKE 'eidos:space:files:mount:%'`
                );
                return mounts.map((m: any) => {
                    const name = m.key.split(':').pop();
                    return { name, path: m.value };
                });
            } catch (error) {
                console.error('Error fetching mounts:', error);
                return [];
            }
        }
    );
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
        // 

        console.log('====== reload data space ======')
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

        // Stop file watcher before closing dataspace
        this.dataSpace.unwatchFileWatcher();

        // Close current dataspace
        this.dataSpace.close();
        this.dataSpace = null;
        return true;
    }

    public async getOrSetDataSpace(spaceId: string, syncOptions?: { enabled: boolean, remote?: string, volumeId?: string }): Promise<DataSpace> {
        if (this.dataSpace && this.dataSpace.dbName !== spaceId) {
            // Close both main and draft databases when switching to a different space
            this.dataSpace.close();
        } else if (this.dataSpace) {
            // If same space, return existing instance
            return this.dataSpace;
        }
        console.log("init space", spaceId)
        const enableSync = syncOptions?.enabled ?? false;
        const libPath = getResourcePath(`dist-sqlite-ext/libsimple`);
        const dictPath = getResourcePath('dist-sqlite-ext/dict');
        const graftLibPath = getResourcePath('dist-sqlite-ext/libgraft');
        const vecLibPath = getResourcePath('dist-sqlite-ext/libvec');

        const credentials = await CredentialsManager.getSyncCredentials('eidos.space');
        if (!credentials) {
            throw new Error(`Credentials for eidos.space not found`);
        }

        const spaceInfo = getSpaceRegistry().getSpace(spaceId);
        if (!spaceInfo) {
            throw new Error(`Space not found: ${spaceId}`);
        }
        const serverDb = new NodeServerDatabase({
            spaceInfo: spaceInfo,
            updateVolumeId: (volumeId: string) => {
                spaceInfo.sync = {
                    ...spaceInfo.sync ?? {},
                    enabled: spaceInfo.sync?.enabled ?? false,
                    remote: spaceInfo.sync?.remote ?? '',
                    volumeId: volumeId,
                }
                getSpaceRegistry().updateSpace(spaceId, spaceInfo);
            },
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
                enabled: enableSync,
                remote: syncOptions?.remote ?? '',
                credentials,
                volumeId: syncOptions?.volumeId ?? '',
            },
            vec: {
                libPath: vecLibPath,
            },
            spacePath: getSpacePath(spaceId),
            logger: console
        });

        const draftDataSpace = new DataSpace({
            db: new NodeServerDatabase({
                spaceInfo: {
                    ...spaceInfo,
                    path: ':memory:',
                },
            }, {
                simple: {
                    libPath,
                    dictPath,
                },
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

export function getOrSetDataSpace(spaceId: string): Promise<DataSpace> {

    const spaceInfo = getSpaceRegistry().getSpace(spaceId);
    if (!spaceInfo) {
        throw new Error(`Space not found: ${spaceId}`);
    }

    return DataSpaceManager.getInstance().getOrSetDataSpace(spaceId, spaceInfo.sync);
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
