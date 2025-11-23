import { DataSpace } from '@eidos.space/core/data-space';
import type { SpaceInitOptions } from '@eidos.space/space-manager';
import { EventEmitter } from 'events';
import './sqlite-setup';  // Ensure SQLite is set up
import { BunServerDatabase } from './bun-server-database';
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
    addEventListener: (type: string, listener: EventListener) => {
      emitter.on(type, listener);
    },
    removeEventListener: (type: string, listener: EventListener) => {
      emitter.off(type, listener);
    },
    dispatchEvent: (event: Event): boolean => {
      return emitter.emit(event.type, event);
    },
    close: () => {
      emitter.removeAllListeners();
    },
  };
}

/**
 * Initialize database with all meta tables
 */
export async function initDatabase(
  dbPath: string,
  extensions: SpaceInitOptions['extensions']
): Promise<void> {
  const dbWrapper = new BunServerDatabase(dbPath, {
    create: true,  // Create new database file
  });

  try {
    // Load extensions
    if (extensions.simple?.libPath) {
      dbWrapper.loadExtension(extensions.simple.libPath);
      console.log('Loaded simple extension');
    }

    if (extensions.vec?.libPath) {
      dbWrapper.loadExtension(extensions.vec.libPath);
      console.log('Loaded vec extension');
    }

    // Create DataSpace instance which will initialize all meta tables
    const dataSpace = new DataSpace({
      db: dbWrapper as any,
      activeUndoManager: false,
      dbName: 'init',
      context: {
        setInterval: undefined,  // Don't provide setInterval to avoid creating timers
      },
      hasLoadExtension: true,
      dataEventChannel: createMockBroadcastChannel('init-channel') as any,
      enableFTS: true,
    });

    console.log('Database initialized with all meta tables');

    // Wait for any async operations to complete before closing
    await new Promise(resolve => setTimeout(resolve, 100));

    // Clean up resources
    try {
      // Close the broadcast channel
      const channel = (dataSpace as any).dataEventChannel;
      if (channel && typeof channel.close === 'function') {
        channel.close();
      }
    } catch (error) {
      // Ignore cleanup errors
    }

    // Close the database
    dbWrapper.close();
    
    console.log('Database connection closed');
  } catch (error) {
    // Clean up on error
    try {
      dbWrapper.close();
    } catch (closeError) {
      // Ignore close errors
    }
    throw error;
  }
}

