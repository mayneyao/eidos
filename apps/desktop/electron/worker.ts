import { MsgType } from '@/lib/const';
import { DataSpace } from "@/packages/core/data-space";
import { handleFunctionCall } from '@/packages/core/rpc';
import { isIteratorFunction } from '@/packages/core/sqlite/channel/iterator-utils';
import { parentPort, workerData } from 'worker_threads';
import { createExternalFileSystem } from "./data-space/external-fs";
import { initUDF } from "./data-space/init-udf";
import { NodeServerDatabase } from "./sqlite-server";
import type { SpaceInfo } from './space-registry';
// import { embedding } from "./data-space-context";

// Config can be set via workerData (threads) or argv (process) or message (IPC)
let config: any = workerData;

try {
    if (!config && process.argv[2]) {
        config = JSON.parse(process.argv[2]);
    }
} catch (e) {
    console.error("Failed to parse config from argv", e);
}

// Global config variables
let spacePath = config?.spacePath;
let simplePathConfig = config?.simplePathConfig;
let vecPathConfig = config?.vecPathConfig;
let graftPathConfig = config?.graftPathConfig;
let spaceInfo: SpaceInfo = config?.spaceInfo;


class DataSpaceManager {
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

    public async close(): Promise<boolean> {
        if (!this.dataSpace) {
            return false
        }

        // Stop file watcher before closing dataspace
        this.dataSpace.unwatchFileWatcher()

        this.dataSpace.close()
        this.dataSpace = null
        return true
    }

    public async getOrSetDataSpace(spaceName: string): Promise<DataSpace> {
        if (this.dataSpace && this.dataSpace.dbName !== spaceName) {
            // Close both main and draft databases when switching to a different space
            this.dataSpace.close();
        } else if (this.dataSpace) {
            // If same space, return existing instance
            return this.dataSpace;
        }
        console.log("init space", spaceName)

        // Create database with sync support
        const serverDb = await NodeServerDatabase.create({
            spaceInfo: spaceInfo,
            options: {
                readonly: false, // Worker can have full access
            }
        }, {
            simple: simplePathConfig,
            vec: vecPathConfig,
            graft: graftPathConfig,
            spacePath: spacePath,
        });

        // Create external file system with space info
        const externalFS = await createExternalFileSystem(serverDb, spaceInfo.path);

        // Create data event channel
        const dataEventChannel = new BroadcastChannel('draft-data-event-channel');

        this.dataSpace = new DataSpace({
            db: serverDb,
            activeUndoManager: false,
            dbName: spaceName,
            context: {
                setInterval,
                // embedding,
            },
            createUDF: initUDF,
            postMessage: (data: any, transfer?: any[]) => {
                // Worker can't send messages to renderer directly
                // This should not be called in worker context
                console.warn('postMessage called in worker context, this should not happen');
            },
            callRenderer: (type: any, data: any) => {
                // Worker can't call renderer directly
                // This should not be called in worker context
                console.warn('callRenderer called in worker context, this should not happen');
                return Promise.reject(new Error('callRenderer not available in worker context'));
            },
            dataEventChannel: dataEventChannel,
            externalFS: externalFS,
            // draftDb: new NodeBaseServerDatabase(new Database(":memory:")),
            enableFTS: true
        });

        this.dataSpace.initFileWatcher();
        return this.dataSpace;
    }
}


// Export convenience functions
function getDataSpace(): DataSpace | null {
    return DataSpaceManager.getInstance().getDataSpace();
}

function getOrSetDataSpace(spaceName: string): Promise<DataSpace> {
    return DataSpaceManager.getInstance().getOrSetDataSpace(spaceName);
}

// Helper function to handle function calls with iterator support
async function handleFunctionCallWithIterator(
    payload: any,
    dataSpace: DataSpace,
    communicationPort: any,
    isExecutePayload: boolean = false,
    useLegacyPort: boolean = false
): Promise<void> {
    const callData = isExecutePayload ? payload.payload : payload.data;
    const messageId = payload.id;

    // Check if this is an iterator function using the registry
    const isIterFunc = isIteratorFunction(callData.method)

    // For iterator functions, create an AbortController to handle cancellation
    let abortController: AbortController | undefined

    // Prepare params - for iterator functions, we'll add AbortSignal
    let finalParams = [...(callData.params || [])]

    // Check if this is an iterator function and create AbortController
    if (isIterFunc) {
        abortController = new AbortController()

        // Listen for cancel messages
        const cancelHandler = (message: any) => {
            if (message?.type === MsgType.IteratorCancel && message?.id === messageId) {
                abortController?.abort()
            }
        }
        communicationPort?.on('message', cancelHandler)

        // Add signal to params if options object exists
        // Note: params come serialized (AbortSignal was removed), so we add our new signal
        if (finalParams.length > 0 && typeof finalParams[finalParams.length - 1] === 'object' && finalParams[finalParams.length - 1] !== null) {
            const lastParam = finalParams[finalParams.length - 1]
            // Replace or add signal with our controller's signal
            finalParams[finalParams.length - 1] = { ...lastParam, signal: abortController.signal }
        } else {
            // Add options with signal
            finalParams.push({ signal: abortController.signal })
        }
    }

    // Create modified payload with final params
    const modifiedPayload = {
        ...callData,
        params: finalParams,
    }

    try {
        const res = await handleFunctionCall(modifiedPayload, dataSpace)

        // Check if the result is an AsyncIterable (for iterator functions like fs.watch)
        // Only treat as iterator if it's explicitly an iterator function
        // and the result is actually an AsyncIterable
        if (isIterFunc && res && typeof res === 'object' && Symbol.asyncIterator in res) {
            // Handle async iterator: yield values as they come
            try {
                for await (const value of res as AsyncIterable<any>) {
                    // Check if cancelled
                    if (abortController?.signal.aborted) {
                        break
                    }
                    const port = useLegacyPort ? communicationPort : communicationPort;
                    port.postMessage({
                        id: messageId,
                        data: {
                            value,
                        },
                        type: MsgType.IteratorValue,
                    })
                }
                // Signal that iterator is done
                const port = useLegacyPort ? communicationPort : communicationPort;
                port.postMessage({
                    id: messageId,
                    data: {},
                    type: MsgType.IteratorDone,
                })
            } catch (error) {
                // Check if it's an abort error
                if (error instanceof Error && error.name === 'AbortError') {
                    const port = useLegacyPort ? communicationPort : communicationPort;
                    port.postMessage({
                        id: messageId,
                        data: {},
                        type: MsgType.IteratorDone,
                    })
                } else {
                    // Signal iterator error
                    const port = useLegacyPort ? communicationPort : communicationPort;
                    port.postMessage({
                        id: messageId,
                        data: {
                            message: error instanceof Error ? error.message : String(error),
                        },
                        type: MsgType.IteratorError,
                    })
                }
            }
        } else {
            // Regular response
            if (useLegacyPort) {
                communicationPort.postMessage(res);
            } else {
                communicationPort.postMessage({
                    id: messageId,
                    type: 'response',
                    result: res
                });
            }
        }
    } catch (e: any) {
        if (useLegacyPort) {
            communicationPort.postMessage({
                id: messageId,
                type: 'response',
                error: {
                    message: e.message,
                    stack: e.stack
                }
            });
        } else {
            communicationPort.postMessage({
                id: messageId,
                type: 'response',
                error: {
                    message: e.message,
                    stack: e.stack
                }
            });
        }
    }
}


let dataSpace = getDataSpace()



const communicationPort = parentPort || (process as any).parentPort

if (communicationPort) {
    communicationPort.on('message', async (message: any) => {
        // Handle direct payload from utilityProcess (some electron versions wrap it, some don't. 
        // usually it's just the object). 
        // If it's from worker_threads, it might be different structure.
        // We assume consistent structure from our pool: { type, ... }
        
        const payload = message.data || message; // Handle potential wrapping

        if (payload.type === 'init') {
            console.log('Worker received init config');
            spacePath = payload.paths.spacePath;
            simplePathConfig = payload.paths.simplePathConfig;
            vecPathConfig = payload.paths.vecPathConfig;
            graftPathConfig = payload.paths.graftPathConfig;
            spaceInfo = payload.spaceInfo;
            // Pre-init dataspace?
            await getOrSetDataSpace(payload.spaceId);
            return;
        }

        console.log('worker received message', payload);
        if (payload.type === 'execute-payload') {
            console.log('worker execute-payload params:', payload.payload.params);
        }
        
        // RPC Call
        if (payload.type === 'call') {
             if (!dataSpace) {
                 console.error("DataSpace not initialized for call", payload);
                 return;
             }
             
             try {
                // if path end with bind, remove it
                if (payload.path[payload.path.length - 1] === 'bind') {
                    payload.path.pop();
                }
                 const res = await handleFunctionCall({
                     space: dataSpace.dbName,
                     dbName: dataSpace.dbName,
                     method: payload.path.join('.'),
                     params: payload.args,
                     userId: 'internal' // TODO
                 }, dataSpace);
                 
                 communicationPort.postMessage({
                     id: payload.id,
                     type: 'response',
                     result: res
                 });
             } catch (e: any) {
                 communicationPort.postMessage({
                     id: payload.id,
                     type: 'response',
                     error: {
                         message: e.message,
                         stack: e.stack
                     }
                 });
             }
             return;
        }

        // RPC Execute Payload
        if (payload.type === 'execute-payload') {
            const { space, dbName } = payload.payload
            const spaceId = space || dbName
            if (!dataSpace) {
                dataSpace = await getOrSetDataSpace(dbName || space)
                console.log('switch to data space', dataSpace.dbName)
            } else if (spaceId !== dataSpace.dbName) {
                console.log('switch to data space', spaceId)
                dataSpace = await getOrSetDataSpace(dbName || space)
            }

            if (!dataSpace) {
                console.error("Failed to initialize DataSpace for execute-payload", payload);
                communicationPort.postMessage({
                    id: payload.id,
                    type: 'response',
                    error: {
                        message: 'Failed to initialize DataSpace',
                        stack: undefined
                    }
                });
                return;
            }

            await handleFunctionCallWithIterator(payload, dataSpace, communicationPort, true);
            return;
        }

        // Legacy / Existing handling (if mixed usage)
        const { port, ...legacyPayload } = payload;
        if (!legacyPayload.data) return; // Not a legacy format we know?

        const { space, dbName } = legacyPayload.data
        const spaceId = space || dbName
        if (!dataSpace) {
            dataSpace = await getOrSetDataSpace(dbName || space)
            console.log('switch to data space', dataSpace.dbName)
        } else if (spaceId !== dataSpace.dbName) {
            console.log('switch to data space', dataSpace.dbName)
            dataSpace = await getOrSetDataSpace(dbName || space)
        }

        await handleFunctionCallWithIterator(payload, dataSpace, port, false, true);
    });
}

process.on('exit', async (code) => {
    console.log(`Worker is exiting with code ${code}`);
    await DataSpaceManager.getInstance().close();
});

process.on('beforeExit', async () => {
    console.log('worker beforeExit')
    await DataSpaceManager.getInstance().close();
})