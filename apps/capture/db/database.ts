import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system';
import { Capture, CaptureType, CaptureMetadata, Setting } from './types';

const DB_NAME = 'eidos_capture.db';

class DatabaseManager {
  private db: SQLite.SQLiteDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  async initialize(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      try {
        // Ensure .eidos directory exists
        const eidosDir = `${FileSystem.documentDirectory}.eidos/`;
        const dirInfo = await FileSystem.getInfoAsync(eidosDir);
        
        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(eidosDir, { intermediates: true });
        }

        // Open database
        this.db = await SQLite.openDatabaseAsync(DB_NAME);
        
        // Enable WAL mode for better performance (use MEMORY mode when graft is enabled)
        await this.db.execAsync('PRAGMA journal_mode = WAL;');
        await this.db.execAsync('PRAGMA synchronous = NORMAL;');
        await this.db.execAsync('PRAGMA temp_store = MEMORY;');
        
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

  async getDatabase(): Promise<SQLite.SQLiteDatabase> {
    if (!this.db) {
      await this.initialize();
    }
    if (!this.db) throw new Error('Database not initialized');
    return this.db;
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
  }

  async deleteSetting(key: string): Promise<void> {
    const db = await this.getDatabase();
    await db.runAsync('DELETE FROM settings WHERE key = ?', [key]);
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

