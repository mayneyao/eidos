import { handleFunctionCall } from '@/packages/core/rpc';
import { DataSpace } from "@/packages/core/data-space";
import { parentPort, workerData } from 'worker_threads';
import { NodeServerDatabase } from "./sqlite-server";



const { spaceDbPath, simplePathConfig, vecPathConfig, graftPathConfig } = workerData
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
        const res = await handleFunctionCall(payload.data, dataSpace)
        port.postMessage(res);
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