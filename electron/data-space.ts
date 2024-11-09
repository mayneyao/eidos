import { EidosDataEventChannelName, EidosMessageChannelName } from "@/lib/const";
import { DataSpace } from "@/worker/web-worker/DataSpace";
import { WebContents, ipcMain } from "electron";
import { getEidosFileSystemManager } from "./file-system/manager";
import { getSpaceDbPath } from "./file-system/space";
import { win } from "./main";
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

    public async getOrSetDataSpace(spaceName: string): Promise<DataSpace> {
        if (this.dataSpace && this.dataSpace.dbName !== spaceName) {
            // Close both main and draft databases when switching to a different space
            this.dataSpace.closeDb();
        } else if (this.dataSpace) {
            // If same space, return existing instance
            return this.dataSpace;
        }
        console.log("init space", spaceName)

        const serverDb = new NodeServerDatabase({
            path: getSpaceDbPath(spaceName),
        });

        const draftDataSpace = new DataSpace({
            db: new NodeServerDatabase({
                path: ':memory:',
            }),
            activeUndoManager: false,
            dbName: 'draft',
            context: {
                setInterval,
            },
            hasLoadExtension: true,
        });

        const efsManager = await getEidosFileSystemManager();

        this.dataSpace = new DataSpace({
            db: serverDb,
            activeUndoManager: false,
            dbName: spaceName,
            context: {
                setInterval,
            },
            hasLoadExtension: true,
            postMessage: (data: any, transfer?: any[]) => {
                win?.webContents.send(EidosMessageChannelName, data, transfer);
            },
            callRenderer: (type: any, data: any) => {
                return requestFromRenderer(win!.webContents, { type, data });
            },
            dataEventChannel: {
                postMessage: (data: any) => {
                    const bc = new BroadcastChannel(EidosDataEventChannelName)
                    // notify renderer
                    win?.webContents.send(EidosDataEventChannelName, data);
                    // notify main process
                    bc.postMessage(data)
                }
            },
            efsManager: efsManager,
            draftDb: draftDataSpace,
        });

        return this.dataSpace;
    }
}


// Export convenience functions
export function getDataSpace(): DataSpace | null {
    return DataSpaceManager.getInstance().getDataSpace();
}

export function getOrSetDataSpace(spaceName: string): Promise<DataSpace> {
    return DataSpaceManager.getInstance().getOrSetDataSpace(spaceName);
}
