import { utilityProcess, MessageChannelMain, app } from 'electron';
import path from 'path';
import { EventEmitter } from 'events';
import type { InitMessage } from './rpc-types';

interface ProcessItem {
  process: Electron.UtilityProcess;
  spaceId: string;
  ready: Promise<void>;
  lastUsed: number;
}

export class DataSpaceProcessPool extends EventEmitter {
  private static instance: DataSpaceProcessPool;
  private processes: Map<string, ProcessItem> = new Map();
  // We can implement a pool limit later, for now 1:1 map
  
  private constructor() {
    super();
  }

  public static getInstance(): DataSpaceProcessPool {
    if (!DataSpaceProcessPool.instance) {
      DataSpaceProcessPool.instance = new DataSpaceProcessPool();
    }
    return DataSpaceProcessPool.instance;
  }

  public getProcess(spaceId: string, initData: Omit<InitMessage, 'type' | 'spaceId'>): Promise<Electron.UtilityProcess> {
    let item = this.processes.get(spaceId);

    if (item) {
        if (this.isProcessDead(item.process)) {
            console.log(`Process for space ${spaceId} is dead, restarting...`);
            this.processes.delete(spaceId);
        } else {
             item.lastUsed = Date.now();
             return item.ready.then(() => item!.process);
        }
    }

    const processPath = app.isPackaged
      ? path.join(process.resourcesPath, 'dist-electron/worker.js')
      : path.join(app.getAppPath(), 'dist-electron/worker.js');

    console.log(`Spawning utility process for ${spaceId} at ${processPath}`);
    
    // In dev mode, we might need to handle TS execution if not pre-compiled, 
    // but usually electron-vite handles this by outputting to dist-electron.
    // We assume dist-electron/worker.js exists.

    const child = utilityProcess.fork(processPath, [], {
        serviceName: `eidos-space-${spaceId}`,
        stdio: 'inherit',
    });

    let resolveReady: () => void;
    let rejectReady: (e: Error) => void;
    const readyPromise = new Promise<void>((resolve, reject) => {
        resolveReady = resolve;
        rejectReady = reject;
    });

    item = {
      process: child,
      spaceId,
      ready: readyPromise,
      lastUsed: Date.now(),
    };
    
    this.processes.set(spaceId, item);

    // Setup lifecycle handlers
    child.on('exit', (code) => {
      console.log(`Process for ${spaceId} exited with code ${code}`);
      this.processes.delete(spaceId);
    });

    child.on('spawn', () => {
        console.log(`Process spawned for ${spaceId}`);
        // Send init message
        const initMsg: InitMessage = {
            type: 'init',
            spaceId,
            ...initData
        };
        child.postMessage(initMsg);
    });
    
    // Wait for worker to signal it's ready (optional, or just resolve immediately if we trust postMessage queue)
    // For now, let's assume valid start on spawn, but a real "ready" ack is better.
    // If we want a strict ready signal, the worker should send one back.
    // Let's rely on standard IPC queueing for now, resolve immediately.
    
    resolveReady!();

    return readyPromise.then(() => child);
  }

  private isProcessDead(proc: Electron.UtilityProcess): boolean {
    // There is no direct .killed property on utilityProcess in some versions, 
    // but we track exit event. If it's in the map, it should be alive.
    // Use a try-catch on a property check or rely on event listeners.
    try {
        return false; 
    } catch {
        return true;
    }
  }

  public killAll() {
    for (const item of this.processes.values()) {
        try {
            item.process.kill();
        } catch (e) {
            console.error(`Failed to kill process for ${item.spaceId}`, e);
        }
    }
    this.processes.clear();
  }
}
