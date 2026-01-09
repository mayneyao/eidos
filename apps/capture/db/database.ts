import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';
import { Capture, CaptureType, CaptureMetadata, Setting } from './types';
import { graftLoader, GraftConfig } from './graft-loader';

const DB_NAME = 'eidos_capture.db';

class DatabaseManager {
  private db: SQLite.SQLiteDatabase | null = null;
  private initPromise: Promise<void> | null = null;
  private graftEnabled = false;

  /**
   * Get sync config file path
   * We store sync config in a separate JSON file to avoid database initialization issues
   */
  private getSyncConfigPath(): string {
    if (!FileSystem.documentDirectory) {
      throw new Error('FileSystem.documentDirectory is not available');
    }
    const eidosDir = `${FileSystem.documentDirectory}eidos/`;
    return `${eidosDir}sync_config.json`;
  }

  /**
   * Read sync config from separate JSON file (not database)
   * This is used at app startup to determine if graft should be enabled
   * 
   * We use a separate file to avoid database initialization issues
   * Returns full config including credentials for graft initialization
   */
  async readSyncConfig(): Promise<any | null> {
    try {
      const configPath = this.getSyncConfigPath();
      const fileInfo = await FileSystem.getInfoAsync(configPath);
      
      if (!fileInfo.exists) {
        console.log('No sync config file found');
        return null;
      }
      
      const configContent = await FileSystem.readAsStringAsync(configPath);
      const config = JSON.parse(configContent);
      console.log('Read sync config from file:', { enabled: config.enabled, endpoint: config.endpoint });
      return config;
    } catch (error) {
      console.log('Error reading sync config file:', error);
      return null;
    }
  }

  /**
   * Write sync config to both database and separate file
   * The separate file is used for app startup detection
   */
  private async writeSyncConfigFile(config: any): Promise<void> {
    try {
      // Ensure .eidos directory exists
      const eidosDir = `${FileSystem.documentDirectory}eidos/`;
      const dirInfo = await FileSystem.getInfoAsync(eidosDir);
      
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(eidosDir, { intermediates: true });
      }
      
      const configPath = this.getSyncConfigPath();
      await FileSystem.writeAsStringAsync(configPath, JSON.stringify(config));
      console.log('Sync config written to file');
    } catch (error) {
      console.error('Error writing sync config file:', error);
      throw error;
    }
  }

  async initialize(enableGraft: boolean = false): Promise<void> {
    // If already initialized with same mode, return
    if (this.initPromise && this.graftEnabled === enableGraft) {
      return this.initPromise;
    }

    // If already initialized with different mode, we cannot change it
    // SQLite doesn't allow changing journal_mode while database is open
    if (this.initPromise && this.graftEnabled !== enableGraft) {
      console.warn(`Database already initialized with graft=${this.graftEnabled}, cannot change to ${enableGraft}`);
      return this.initPromise;
    }

    this.graftEnabled = enableGraft;

    this.initPromise = (async () => {
      try {
        // Ensure .eidos directory exists
        const eidosDir = `${FileSystem.documentDirectory}eidos/`;
        const dirInfo = await FileSystem.getInfoAsync(eidosDir);
        
        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(eidosDir, { intermediates: true });
        }

        // Step 1: Load graft extension FIRST (if needed) to register VFS
        if (this.graftEnabled) {
          console.log('Graft enabled, checking if graftLoader is initialized...');
          
          // Check if graftLoader is initialized (should be done by _layout.tsx)
          if (!graftLoader.isGraftEnabled()) {
            console.warn('Graft requested but graftLoader not initialized!');
            console.log('Falling back to standard mode');
            this.graftEnabled = false;
          } else {
            console.log('Loading graft extension to register VFS...');
            
            // Use a temporary in-memory database just to load the extension
            // This registers the graft VFS with SQLite
            const tempDb = await SQLite.openDatabaseAsync(':memory:');
            const loaded = await graftLoader.loadExtension(tempDb);
            await tempDb.closeAsync();
            
            if (!loaded) {
              console.log('Failed to load graft extension, falling back to standard mode');
              this.graftEnabled = false;
            } else {
              console.log('✓ Graft VFS registered successfully');
            }
          }
        }

        // Step 2: Open main database with appropriate VFS
        if (this.graftEnabled) {
          // For graft VFS, use URI format to specify VFS
          // See: https://www.sqlite.org/uri.html
          const dbUri = `file:${DB_NAME}?vfs=graft`;
          console.log(`Opening database with Graft VFS: ${dbUri}`);
          this.db = await SQLite.openDatabaseAsync(dbUri, {
            useNewConnection: true, // Force new connection for VFS change
          });
          
          // Step 3: Set PRAGMA immediately after opening with graft VFS
          console.log('Configuring database for graft VFS mode');
          await this.configureForGraft();
        } else {
          // Standard mode - just use database name
          console.log(`Opening database in standard mode: ${DB_NAME}`);
          this.db = await SQLite.openDatabaseAsync(DB_NAME);
          await this.configureStandard();
        }
        
        // Read and execute schema
        await this.initializeSchema();
        
        console.log('Database initialized successfully');
      } catch (error) {
        console.error('Failed to initialize database:', error);
        throw error;
      }
    })();

    return this.initPromise;
  }

  /**
   * Configure database for standard mode (no graft)
   */
  private async configureStandard(): Promise<void> {
    if (!this.db) return;
    
    await this.db.execAsync('PRAGMA journal_mode = WAL;');
    await this.db.execAsync('PRAGMA synchronous = NORMAL;');
    await this.db.execAsync('PRAGMA temp_store = MEMORY;');
  }

  /**
   * Configure database for graft VFS mode
   */
  private async configureForGraft(): Promise<void> {
    if (!this.db) return;
    
    // Use graftLoader's configuration which sets:
    // - page_size = 4096 (required by graft)
    // - journal_mode = MEMORY (required by graft)
    await graftLoader.configureDatabaseForGraft(this.db);
  }

  private async initializeSchema(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const schema = `
      CREATE TABLE IF NOT EXISTS captures (
        id TEXT PRIMARY KEY,
        content TEXT,
        created_at INTEGER NOT NULL,
        type TEXT DEFAULT 'text',
        metadata TEXT,
        synced INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_captures_created_at ON captures(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_captures_synced ON captures(synced);

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `;

    await this.db.execAsync(schema);
  }

  /**
   * Wait for database to be initialized
   * This method will poll until initialization starts or completes
   */
  async waitForInitialization(): Promise<void> {
    // If already initialized, return immediately
    if (this.db && !this.initPromise) {
      return;
    }
    
    // If initialization is in progress, wait for it
    if (this.initPromise) {
      return this.initPromise;
    }
    
    // Wait for initialization to start (poll for up to 5 seconds)
    const maxWaitTime = 5000;
    const pollInterval = 50;
    const startTime = Date.now();
    
    while (!this.initPromise && !this.db) {
      if (Date.now() - startTime > maxWaitTime) {
        throw new Error('Database initialization timeout. _layout.tsx should call initialize()');
      }
      
      // Wait a bit and check again
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
    
    // Now wait for the actual initialization to complete
    if (this.initPromise) {
      await this.initPromise;
    }
  }

  async getDatabase(): Promise<SQLite.SQLiteDatabase> {
    if (!this.db) {
      // If database not initialized yet, wait for ongoing initialization or throw error
      if (this.initPromise) {
        await this.initPromise;
      } else {
        throw new Error('Database not initialized. Call initialize() first from _layout.tsx');
      }
    }
    if (!this.db) throw new Error('Database not initialized');
    return this.db;
  }

  /**
   * Check if database is using graft VFS
   */
  isGraftEnabled(): boolean {
    return this.graftEnabled && graftLoader.isUsingNativeVFS();
  }

  /**
   * Get database file path
   */
  getDatabasePath(): string {
    if (!FileSystem.documentDirectory) {
      throw new Error('FileSystem.documentDirectory is not available');
    }
    const eidosDir = `${FileSystem.documentDirectory}eidos/`;
    return `${eidosDir}${DB_NAME}`;
  }

  /**
   * Get graft sync status (if using native VFS)
   */
  async getGraftSyncStatus() {
    if (!this.isGraftEnabled() || !this.db) {
      return null;
    }
    
    return await graftLoader.getSyncStatus(this.db);
  }

  /**
   * Manually trigger graft sync
   */
  async triggerGraftSync(): Promise<void> {
    if (!this.isGraftEnabled() || !this.db) {
      throw new Error('Graft VFS not enabled');
    }
    
    await graftLoader.triggerSync(this.db);
  }

  // Capture operations
  async createCapture(
    content: string,
    type: CaptureType = 'text',
    metadata?: CaptureMetadata
  ): Promise<Capture> {
    const db = await this.getDatabase();
    const id = `capture_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const created_at = Date.now();
    
    await db.runAsync(
      'INSERT INTO captures (id, content, created_at, type, metadata, synced) VALUES (?, ?, ?, ?, ?, ?)',
      [id, content, created_at, type, metadata ? JSON.stringify(metadata) : null, 0]
    );

    return {
      id,
      content,
      created_at,
      type,
      metadata,
      synced: 0,
    };
  }

  async getCaptures(limit: number = 100, offset: number = 0): Promise<Capture[]> {
    const db = await this.getDatabase();
    const rows = await db.getAllAsync<{
      id: string;
      content: string;
      created_at: number;
      type: CaptureType;
      metadata: string | null;
      synced: number;
    }>(
      'SELECT * FROM captures ORDER BY created_at ASC LIMIT ? OFFSET ?',
      [limit, offset]
    );

    return rows.map(row => ({
      ...row,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    }));
  }

  async getCaptureById(id: string): Promise<Capture | null> {
    const db = await this.getDatabase();
    const row = await db.getFirstAsync<{
      id: string;
      content: string;
      created_at: number;
      type: CaptureType;
      metadata: string | null;
      synced: number;
    }>(
      'SELECT * FROM captures WHERE id = ?',
      [id]
    );

    if (!row) return null;

    return {
      ...row,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    };
  }

  async deleteCapture(id: string): Promise<void> {
    const db = await this.getDatabase();
    await db.runAsync('DELETE FROM captures WHERE id = ?', [id]);
  }

  async markCaptureAsSynced(id: string): Promise<void> {
    const db = await this.getDatabase();
    await db.runAsync('UPDATE captures SET synced = 1 WHERE id = ?', [id]);
  }

  async getUnsyncedCaptures(): Promise<Capture[]> {
    const db = await this.getDatabase();
    const rows = await db.getAllAsync<{
      id: string;
      content: string;
      created_at: number;
      type: CaptureType;
      metadata: string | null;
      synced: number;
    }>(
      'SELECT * FROM captures WHERE synced = 0 ORDER BY created_at ASC'
    );

    return rows.map(row => ({
      ...row,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    }));
  }

  // Settings operations
  async getSetting(key: string): Promise<string | null> {
    const db = await this.getDatabase();
    const row = await db.getFirstAsync<{ value: string }>(
      'SELECT value FROM settings WHERE key = ?',
      [key]
    );
    return row?.value || null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    const db = await this.getDatabase();
    await db.runAsync(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
      [key, value]
    );
    
    // If sync_config is updated, also write to separate file
    // This allows app startup to detect sync config without opening database
    if (key === 'sync_config') {
      try {
        const config = JSON.parse(value);
        await this.writeSyncConfigFile(config);
      } catch (error) {
        console.error('Error writing sync config file:', error);
        // Don't throw, as database update succeeded
      }
    }
  }

  async deleteSetting(key: string): Promise<void> {
    const db = await this.getDatabase();
    await db.runAsync('DELETE FROM settings WHERE key = ?', [key]);
    
    // If sync_config is deleted, also delete the file
    if (key === 'sync_config') {
      try {
        const configPath = this.getSyncConfigPath();
        const fileInfo = await FileSystem.getInfoAsync(configPath);
        if (fileInfo.exists) {
          await FileSystem.deleteAsync(configPath);
          console.log('Sync config file deleted');
        }
      } catch (error) {
        console.error('Error deleting sync config file:', error);
        // Don't throw, as database delete succeeded
      }
    }
  }

  async getAllSettings(): Promise<Setting[]> {
    const db = await this.getDatabase();
    return await db.getAllAsync<Setting>('SELECT * FROM settings');
  }

  // Utility methods
  async getCaptureCount(): Promise<number> {
    const db = await this.getDatabase();
    const row = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM captures'
    );
    return row?.count || 0;
  }

  async clearAllCaptures(): Promise<void> {
    const db = await this.getDatabase();
    await db.runAsync('DELETE FROM captures');
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.closeAsync();
      this.db = null;
      this.initPromise = null;
    }
  }
}

// Export singleton instance
export const database = new DatabaseManager();

