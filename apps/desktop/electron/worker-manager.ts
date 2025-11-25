import path from 'path';
import * as worker_threads from 'worker_threads';
import { Worker } from 'worker_threads';
import { getSpaceDbPath, getSpacePath } from './file-system/space';

export interface WorkerConfig {
    simplePathConfig: any;
    vecPathConfig: any;
    graftPathConfig: any;
}

export class WorkerManager {
    private static instance: WorkerManager;
    private workers: Map<string, Worker> = new Map();

    private constructor() { }

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

        if (!worker) {
            worker = new Worker(path.join(__dirname, 'worker.js'), {
                workerData: {
                    spaceDbPath,
                    spacePath,
                    ...config
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