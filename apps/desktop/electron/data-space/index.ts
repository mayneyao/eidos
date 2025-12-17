import type { DataSpace } from "@/packages/core/data-space"
import { CredentialsManager } from "../credentials"
import { getSpacePath } from "../file-system/space"
import { getResourcePath } from "../helper"
import { getSpaceRegistry } from "../space-registry"
import { DataSpaceProcessPool } from "./process-pool"
import { createDataSpaceProxy } from "./proxy"

// ... imports remain ...

export class DataSpaceManager {
  private static instance: DataSpaceManager
  private dataSpaceProxy: DataSpace | null = null
  private currentSpaceId: string | null = null

  private constructor() {}

  public static getInstance(): DataSpaceManager {
    if (!DataSpaceManager.instance) {
      DataSpaceManager.instance = new DataSpaceManager()
    }
    return DataSpaceManager.instance
  }

  public getDataSpace(): DataSpace | null {
    return this.dataSpaceProxy
  }

  public async reload(): Promise<DataSpace | null> {
    console.log("====== reload data space ======")
    if (!this.currentSpaceId) {
      return null
    }

    // Close proxy/connection? 
    // The pool handles checking if process is dead.
    // To force reload, we might want to kill the process in the pool
    // But for now, just re-getting it serves as 'reload' for the variable
    
    // If we want a hard reload:
    // DataSpaceProcessPool.getInstance().terminate(this.currentSpaceId);
    
    // Reinitialize with the same space name
    return this.getOrSetDataSpace(this.currentSpaceId)
  }

  public async close(): Promise<boolean> {
    if (!this.currentSpaceId) {
      return false
    }

    // Terminate the process via pool? Or just nullify proxy?
    // Generally 'close' in single-process meant closing db connection.
    // Here it means terminating the worker.
    DataSpaceProcessPool.getInstance().killAll() // or terminate specific
    
    this.dataSpaceProxy = null
    this.currentSpaceId = null
    return true
  }

  public async getOrSetDataSpace(
    spaceId: string,
    syncOptions?: { enabled: boolean; remote?: string; volumeId?: string }
  ): Promise<DataSpace> {
    if (this.currentSpaceId && this.currentSpaceId !== spaceId) {
        // Switching space
         // Maybe kill the previous one to save memory?
         // DataSpaceProcessPool.getInstance().terminate(this.currentSpaceId);
    }
    this.currentSpaceId = spaceId

    // Prepare Init configuration for the worker
    const libPath = getResourcePath(`dist-sqlite-ext/libsimple`)
    const dictPath = getResourcePath("dist-sqlite-ext/dict")
    const graftLibPath = getResourcePath("dist-sqlite-ext/libgraft")
    const vecLibPath = getResourcePath("dist-sqlite-ext/libvec")

    const credentials = await CredentialsManager.getSyncCredentials("eidos.space")
     if (!credentials) {
      // throw new Error(`Credentials for eidos.space not found`) 
      // Keep existing logic, maybe it works without credentials for local?
    }

    const spaceInfo = getSpaceRegistry().getSpace(spaceId)
    if (!spaceInfo) {
       throw new Error(`Space not found: ${spaceId}`)
    }

    const initData = {
        spaceInfo,
        paths: {
            spacePath: getSpacePath(spaceId),
            simplePathConfig: { libPath, dictPath },
            vecPathConfig: { libPath: vecLibPath },
            graftPathConfig: {
                 libPath: graftLibPath,
                 enabled: syncOptions?.enabled ?? spaceInfo.sync?.enabled ?? false,
                 remote: syncOptions?.remote ?? spaceInfo.sync?.remote ?? "",
                 credentials,
                 volumeId: syncOptions?.volumeId ?? spaceInfo.sync?.volumeId ?? "",
            }
        }
    }

    const pool = DataSpaceProcessPool.getInstance()
    const childProcess = await pool.getProcess(spaceId, initData)

    // Create Proxy
    this.dataSpaceProxy = createDataSpaceProxy(async (req) => {
        return new Promise((resolve, reject) => {
             // We need a way to map response back. 
             // Since utilityProcess.postMessage doesn't return a promise 
             // and we rely on simple message handling, we need a refined communication layer.
             // But for MVP, let's assume we can set up a one-time listener or 
             // (better) use the shared message channel logic if we had one.
             
             // Wait, the pool/worker logic above in process-pool.ts didn't fully implement 
             // the response matching for RPC.
             // We need to implement the response matching here or in the pool.
             
             const id = req.id;
             const handler = (message: any) => {
                 const payload = message.data || message;
                 if (payload.id === id && payload.type === 'response') {
                     childProcess.off('message', handler);
                     resolve(payload);
                 }
             };
             childProcess.on('message', handler);
             childProcess.postMessage(req);
        })
    })

    return this.dataSpaceProxy
  }
}

// Export convenience functions
export function getDataSpace(): DataSpace | null {
  return DataSpaceManager.getInstance().getDataSpace()
}

export function getOrSetDataSpace(spaceId: string): Promise<DataSpace> {
  // We can just proxy to the manager
  return DataSpaceManager.getInstance().getOrSetDataSpace(spaceId)
}

export function reloadDataSpace(): Promise<{ success: boolean }> {
  DataSpaceManager.getInstance().reload()
  return Promise.resolve({
    success: true,
  })
}

export async function closeDataSpace(): Promise<{ success: boolean }> {
  const success = await DataSpaceManager.getInstance().close()
  return {
    success,
  }
}
