import { handleFunctionCall } from '@/packages/core/rpc';
import { DataSpace } from "@/packages/core/data-space";
import { parentPort, workerData } from 'worker_threads';
import { NodeServerDatabase } from "./sqlite-server";
import { MsgType } from '@/lib/const';
import { isIteratorFunction } from '@/packages/core/sqlite/channel/iterator-utils';



const { spaceDbPath, spacePath, simplePathConfig, vecPathConfig, graftPathConfig } = workerData
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

    public async getOrSetDataSpace(spaceName: string): Promise<DataSpace> {
        if (this.dataSpace && this.dataSpace.dbName !== spaceName) {
            // Close both main and draft databases when switching to a different space
            this.dataSpace.close();
        } else if (this.dataSpace) {
            // If same space, return existing instance
            return this.dataSpace;
        }
        console.log("init space", spaceName)

        const serverDb = new NodeServerDatabase({
            path: spaceDbPath,
            options: {
                readonly: true,
            }
        }, {
            simple: simplePathConfig,
            vec: vecPathConfig,
            graft: graftPathConfig,
            enableSync: false,
            spacePath: spacePath,
        });
        this.dataSpace = new DataSpace({
            db: serverDb,
            activeUndoManager: false,
            dbName: spaceName,
            context: {
                setInterval,
            },
            hasLoadExtension: true,
            // upgrade cache to improve performance
            // cacheSize: 8 * 1024 * 1024,
            dataEventChannel: new BroadcastChannel('draft-data-event-channel'),
            enableFTS: true
        });

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


let dataSpace = getDataSpace()



if (parentPort) {
    parentPort.on('message', async ({ port, ...payload }) => {
        console.log('worker received message', payload);
        const { space, dbName } = payload.data
        const spaceId = space || dbName
        if (!dataSpace) {
            dataSpace = await getOrSetDataSpace(dbName || space)
            console.log('switch to data space', dataSpace.dbName)
        } else if (spaceId !== dataSpace.dbName) {
            console.log('switch to data space', dataSpace.dbName)
            dataSpace = await getOrSetDataSpace(dbName || space)
        }
        // Check if this is an iterator function using the registry
        const isIterFunc = isIteratorFunction(payload.data.method)

        // For iterator functions, create an AbortController to handle cancellation
        let abortController: AbortController | undefined

        // Prepare params - for iterator functions, we'll add AbortSignal
        let finalParams = [...(payload.data.params || [])]

        // Check if this is an iterator function and create AbortController
        if (isIterFunc) {
            abortController = new AbortController()

            // Listen for cancel messages
            const cancelHandler = (message: any) => {
                if (message?.type === MsgType.IteratorCancel && message?.id === payload.id) {
                    abortController?.abort()
                }
            }
            parentPort?.on('message', cancelHandler)

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
            ...payload.data,
            params: finalParams,
        }

        const res = await handleFunctionCall(modifiedPayload, dataSpace)

        // Check if the result is an AsyncIterable (for iterator functions)
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
                    port.postMessage({
                        id: payload.id,
                        data: {
                            value,
                        },
                        type: MsgType.IteratorValue,
                    })
                }
                // Signal that iterator is done
                port.postMessage({
                    id: payload.id,
                    data: {},
                    type: MsgType.IteratorDone,
                })
            } catch (error) {
                // Check if it's an abort error
                if (error instanceof Error && error.name === 'AbortError') {
                    port.postMessage({
                        id: payload.id,
                        data: {},
                        type: MsgType.IteratorDone,
                    })
                } else {
                    // Signal iterator error
                    port.postMessage({
                        id: payload.id,
                        data: {
                            message: error instanceof Error ? error.message : String(error),
                        },
                        type: MsgType.IteratorError,
                    })
                }
            }
        } else {
            // Regular response
            port.postMessage(res);
        }
    });
}

process.on('exit', (code) => {
    console.log(`Worker is exiting with code ${code}`);
    if (dataSpace) {
        dataSpace.close();
        dataSpace = null;
    }
});

process.on('beforeExit', () => {
    console.log('worker beforeExit')
    dataSpace?.close()
    dataSpace = null;
})