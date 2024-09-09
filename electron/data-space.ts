import { DataSpace } from "@/worker/web-worker/DataSpace";
import { getEidosFileSystemManager } from "./file-system/manager";
import { getSpaceDbPath } from "./file-system/space";
import { NodeServerDatabase } from "./sqlite-server";

export let dataSpace: DataSpace | null = null

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
            setInterval: undefined,
        },
        postMessage: (data: any) => {
        },
        efsManager: efsManager
    });
    return dataSpace
}


