import fs from 'fs';
import path from 'path';
import type { SpaceInfo } from './types';
import { getSpaceRegistry } from './space-registry';

export interface SpaceInitOptions {
  /**
   * Custom name for the space
   */
  name?: string;

  /**
   * Extension library paths (required for database initialization)
   */
  extensions: {
    simple?: { libPath: string; dictPath: string };
    vec?: { libPath: string };
    graft?: { libPath: string };
  };

  /**
   * Logger function
   */
  logger?: {
    log: (...args: any[]) => void;
    error: (...args: any[]) => void;
    warn: (...args: any[]) => void;
  };
}

export class SpaceInitializer {
  private logger: SpaceInitOptions['logger'];

  constructor(private options: SpaceInitOptions) {
    this.logger = options.logger || console;
  }

  /**
   * Initialize a new space at the target path
   */
  public async initSpace(targetPath: string): Promise<SpaceInfo> {
    // 1. Check if already initialized
    const eidosDir = path.join(targetPath, '.eidos');
    const dbPath = path.join(eidosDir, 'db.sqlite3');

    if (fs.existsSync(eidosDir)) {
      throw new Error(`Space already initialized at ${targetPath}`);
    }

    this.logger?.log(`Initializing space at ${targetPath}...`);

    try {
      // 2. Create directory structure
      fs.mkdirSync(eidosDir, { recursive: true });
      fs.mkdirSync(path.join(eidosDir, 'files'), { recursive: true });
      this.logger?.log('Created .eidos directory structure');

      // 3. Initialize database
      await this.initDatabase(dbPath);
      this.logger?.log('Database initialized');

      // 4. Register space
      const registry = getSpaceRegistry();
      const space = registry.registerSpace(targetPath, this.options.name);
      this.logger?.log(`Space registered with ID: ${space.id}`);

      return space;
    } catch (error) {
      // Cleanup on error
      if (fs.existsSync(eidosDir)) {
        fs.rmSync(eidosDir, { recursive: true, force: true });
      }
      throw error;
    }
  }

  /**
   * Initialize the database with all meta tables
   * This is implemented by consumers who have access to NodeServerDatabase and DataSpace
   */
  private async initDatabase(dbPath: string): Promise<void> {
    throw new Error('initDatabase must be overridden by consumer with access to database libraries');
  }
}

/**
 * Create a space initializer with custom database initialization
 */
export function createSpaceInitializer(
  options: SpaceInitOptions,
  initDatabaseFn: (dbPath: string, extensions: SpaceInitOptions['extensions']) => Promise<void>
): SpaceInitializer {
  const initializer = new SpaceInitializer(options);
  // Override the initDatabase method
  (initializer as any).initDatabase = async (dbPath: string) => {
    await initDatabaseFn(dbPath, options.extensions);
  };
  return initializer;
}

