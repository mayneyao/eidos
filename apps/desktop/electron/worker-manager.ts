import path from 'path';
import * as worker_threads from 'worker_threads';
import { Worker } from 'worker_threads';
import { getSpaceDbPath, getSpacePath } from './file-system/space';
import type { SpaceInfo } from './space-registry';
import { getSpaceRegistry } from './space-registry';
import type { SyncBucketCredentials } from './credentials';

export interface WorkerConfig {
    simplePathConfig: {
        libPath: string;
        dictPath: string;
    };
    vecPathConfig: {
        libPath: string;
    };
    graftPathConfig: {
        libPath: string;
        enabled: boolean;
        remote: string;
        credentials: SyncBucketCredentials;
    };
    spaceInfo: SpaceInfo
}

export class WorkerManager {
    private static instance: WorkerManager;
    private workers: Map<string, Worker> = new Map();

    private constructor() { 

    }

    public static getInstance(): WorkerManager {
        if (!WorkerManager.instance) {
            WorkerManager.instance = new WorkerManager();
        }
        return WorkerManager.instance;
    }

    async executeTask(payload: any, config: WorkerConfig): Promise<any> {
        const { space, dbName } = payload.data;
        const spaceId = space || dbName;
        const spaceDbPath = getSpaceDbPath(spaceId);
        const spacePath = getSpacePath(spaceId);

        let worker = this.workers.get(spaceId);
        const spaceInfo  = getSpaceRegistry().getSpace(spaceId);
        if (!spaceInfo) {
            throw new Error(`Space ${spaceId} not found`);
        }
        const enableSync = spaceInfo.sync?.enabled ?? false;
        const remote = spaceInfo.sync?.remote ?? '';

        
        if (!worker) {
            worker = new Worker(path.join(__dirname, 'worker.js'), {
                workerData: {
                    spaceDbPath,
                    spacePath,
                    ...config,
                    graftPathConfig: {
                        libPath: config.graftPathConfig.libPath,
                        enabled: enableSync,
                        remote,
                        credentials: config.graftPathConfig.credentials,
                    },
                    spaceInfo
                },
                // stdout: true,
                // stderr: true,
                // stdin: true
            });
            this.workers.set(spaceId, worker);

            worker.on('error', (err) => {
                console.error(`Worker error for space ${spaceId}:`, err);
                this.removeWorker(spaceId);
            });
        }

        return new Promise((resolve, reject) => {
            const { port1, port2 } = new worker_threads.MessageChannel();

            port1.on('message', (result) => {
                port1.close();
                resolve(result);
            });

            port1.on('error', (error) => {
                port1.close();
                this.removeWorker(spaceId);
                reject(error);
            });

            worker!.postMessage({ ...payload, port: port2 }, [port2]);
        });
    }

    private removeWorker(spaceId: string) {
        const worker = this.workers.get(spaceId);
        if (worker) {
            worker.terminate();
            this.workers.delete(spaceId);
        }
    }

    shutdown() {
        for (const [_, worker] of this.workers) {
            worker.terminate();
        }
        this.workers.clear();
    }
} 