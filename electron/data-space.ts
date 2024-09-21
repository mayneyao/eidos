import { DataSpace } from "@/worker/web-worker/DataSpace";
import { getEidosFileSystemManager } from "./file-system/manager";
import { getSpaceDbPath } from "./file-system/space";
import { NodeServerDatabase } from "./sqlite-server";
import { win } from "./main";
import { EidosDataEventChannelName, EidosMessageChannelName } from "@/lib/const";
import { MessageChannelMain, WebContents, ipcMain } from "electron";

export let dataSpace: DataSpace | null = null

function requestFromRenderer(webContents: WebContents, arg: any) {
    return new Promise((resolve, reject) => {
        const requestId = Math.random().toString(36).substr(2, 9); // 生成唯一请求ID

        ipcMain.once(`response-${requestId}`, (event: any, result: any) => {
            resolve(result);
        });

        webContents.send('request-from-main', requestId, arg);
    });
}

export async function getOrSetDataSpace(spaceName: string) {
    if (dataSpace) {
        dataSpace.closeDb()
    }
    const serverDb = new NodeServerDatabase({
        path: getSpaceDbPath(spaceName),
    });

    const efsManager = await getEidosFileSystemManager()

    dataSpace = new DataSpace({
        db: serverDb,
        activeUndoManager: false,
        dbName: spaceName,
        context: {
            setInterval,
        },
        hasLoadExtension: true,
        postMessage: (data: any, transfer?: any[]) => {
            win?.webContents.send(EidosMessageChannelName, data, transfer)
        },
        callRenderer: (type: any, data: any) => {
            return requestFromRenderer(win!.webContents, { type, data })
        },
        dataEventChannel: {
            postMessage: (data: any) => {
                win?.webContents.send(EidosDataEventChannelName, data)
            }
        },
        efsManager: efsManager
    });
    return dataSpace
}


