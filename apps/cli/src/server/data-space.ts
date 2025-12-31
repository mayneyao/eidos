import { DataSpace } from '@eidos.space/core/data-space';
import { getSpaceRegistry } from '@eidos.space/space-manager';
import { EventEmitter } from 'events';
import { existsSync } from 'fs';
import path from 'path';
import { getExtensionsDir } from '../utils/extensions';
import { BunServerDatabase } from '../db/bun-server-database';

/**
 * Create a mock BroadcastChannel for CLI environment
 */
function createMockBroadcastChannel(name: string) {
  const emitter = new EventEmitter();
  return {
    name,
    postMessage: (data: any) => {
      setTimeout(() => {
        emitter.emit('message', { data });
      }, 0);
    },
    set onmessage(handler: (event: { data: any }) => void) {
      emitter.removeAllListeners('message');
      if (handler) {
        emitter.on('message', handler);
      }
    },
    onmessageerror: null,
    addEventListener: (type: string, listener: (...args: any[]) => void) => {
      emitter.on(type, listener);
    },
    removeEventListener: (type: string, listener: (...args: any[]) => void) => {
      emitter.off(type, listener);
    },
    dispatchEvent: (event: any): boolean => {
      return emitter.emit(event.type, event);
    },
    close: () => {
      emitter.removeAllListeners();
    },
  };
}

// Cache for DataSpace instances
const dataSpaceCache = new Map<string, DataSpace>();

/**
 * Get or create a DataSpace instance for a space
 */
export async function getDataSpace(spaceId: string): Promise<DataSpace> {
  console.log(`[DataSpace] Getting DataSpace for: ${spaceId}`);
  console.log(`[DataSpace] Current cache size: ${dataSpaceCache.size}`);
  console.log(`[DataSpace] Cached spaces:`, Array.from(dataSpaceCache.keys()));

  // Check cache
  if (dataSpaceCache.has(spaceId)) {
    console.log(`[DataSpace] Returning cached instance for: ${spaceId}`);
    return dataSpaceCache.get(spaceId)!;
  }

  // Get space info from registry
  const registry = getSpaceRegistry();
  const space = registry.getSpace(spaceId);

  if (!space) {
    throw new Error(`Space not found: ${spaceId}`);
  }

  console.log(`[DataSpace] Space info:`, {
    id: space.id,
    name: space.name,
    path: space.path,
  });

  if (!space.path) {
    throw new Error(`Space path is undefined for space: ${spaceId}`);
  }

  const dbPath = path.join(space.path, '.eidos', 'db.sqlite3');

  console.log(`[DataSpace] Checking database at: ${dbPath}`);

  if (!existsSync(dbPath)) {
    throw new Error(`Database not found: ${dbPath}`);
  }

  // Check file stats
  const fs = require('fs');
  const stats = fs.statSync(dbPath);
  console.log(`[DataSpace] Database file stats:`, {
    size: stats.size,
    mode: stats.mode.toString(8),
    isFile: stats.isFile(),
  });

  console.log(`[DataSpace] Loading space: ${spaceId} from ${dbPath}`);

  // Create database adapter
  let dbWrapper: BunServerDatabase;
  try {
    console.log(`[DataSpace] Creating BunServerDatabase instance...`);
    dbWrapper = new BunServerDatabase(dbPath, { readwrite: true });
    console.log(`[DataSpace] Database adapter created successfully`);
  } catch (error: any) {
    console.error(`[DataSpace] Failed to create database adapter:`, error);
    console.error(`[DataSpace] Error details:`, {
      name: error.name,
      message: error.message,
      code: error.code,
      errno: error.errno,
    });
    throw new Error(`Failed to open database: ${error.message}`);
  }

  // Load extensions
  try {
    const extensionsDir = getExtensionsDir();
    
    if (extensionsDir) {
      const libsimplePath = path.join(extensionsDir, process.platform === 'win32' ? 'libsimple.dll' : `libsimple.${process.platform === 'darwin' ? 'dylib' : 'so'}`);
      const libvecPath = path.join(extensionsDir, process.platform === 'win32' ? 'libvec.dll' : `libvec.${process.platform === 'darwin' ? 'dylib' : 'so'}`);

      if (existsSync(libsimplePath)) {
        dbWrapper.loadExtension(libsimplePath);
      }

      if (existsSync(libvecPath)) {
        dbWrapper.loadExtension(libvecPath);
      }
    }
  } catch (error: any) {
    console.warn('Could not load extensions:', error.message);
  }

  // Create DataSpace instance
  const dataSpace = new DataSpace({
    db: dbWrapper as any,
    activeUndoManager: false,
    dbName: spaceId,
    context: {
      setInterval,
    },
    dataEventChannel: createMockBroadcastChannel(`space-${spaceId}`) as any,
    enableFTS: true,
  });

  // Cache the instance
  dataSpaceCache.set(spaceId, dataSpace);

  console.log(`✓ Space loaded: ${spaceId}`);

  return dataSpace;
}

/**
 * Close and remove a DataSpace from cache
 */
export function closeDataSpace(spaceId: string): void {
  console.log(`[DataSpace] Closing space: ${spaceId}`);
  const dataSpace = dataSpaceCache.get(spaceId);
  
  if (dataSpace) {
    try {
      // Close database connection
      const db = (dataSpace as any).db;
      if (db && typeof db.close === 'function') {
        db.close();
        console.log(`[DataSpace] Database connection closed for: ${spaceId}`);
      }
    } catch (error) {
      console.error(`[DataSpace] Error closing database:`, error);
    }
    
    dataSpaceCache.delete(spaceId);
    console.log(`[DataSpace] Space removed from cache: ${spaceId}`);
  } else {
    console.log(`[DataSpace] Space not in cache: ${spaceId}`);
  }
}

/**
 * Close all cached DataSpaces
 */
export function closeAllDataSpaces(): void {
  console.log(`[DataSpace] Closing all spaces (${dataSpaceCache.size} total)`);
  const spaceIds = Array.from(dataSpaceCache.keys());
  
  for (const spaceId of spaceIds) {
    closeDataSpace(spaceId);
  }
  
  console.log(`[DataSpace] All spaces closed`);
}

/**
 * Export database manager for monitoring
 */
export { dbManager } from '../db/database-manager';

