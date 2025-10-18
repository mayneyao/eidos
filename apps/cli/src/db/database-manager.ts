import { Database } from 'bun:sqlite';
import './sqlite-setup';  // Ensure SQLite is set up

/**
 * Global database connection manager
 * Ensures each database file is only opened once
 */
class DatabaseManager {
  private static instance: DatabaseManager;
  private connections: Map<string, Database> = new Map();
  private refCounts: Map<string, number> = new Map();

  private constructor() {}

  static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  /**
   * Get or create a database connection
   */
  getConnection(dbPath: string, options: { create?: boolean; readonly?: boolean; readwrite?: boolean } = {}): Database {
    console.log(`[DatabaseManager] Getting connection for: ${dbPath}`);
    
    // Check if connection already exists
    if (this.connections.has(dbPath)) {
      const refCount = this.refCounts.get(dbPath) || 0;
      this.refCounts.set(dbPath, refCount + 1);
      console.log(`[DatabaseManager] Reusing existing connection (refs: ${refCount + 1})`);
      return this.connections.get(dbPath)!;
    }

    // Create new connection
    console.log(`[DatabaseManager] Creating new connection with options:`, options);
    try {
      const db = new Database(dbPath, options);
      this.connections.set(dbPath, db);
      this.refCounts.set(dbPath, 1);
      console.log(`[DatabaseManager] ✓ Connection created (total: ${this.connections.size})`);
      return db;
    } catch (error: any) {
      console.error(`[DatabaseManager] Failed to create connection:`, {
        path: dbPath,
        error: error.message,
        code: error.code,
      });
      throw error;
    }
  }

  /**
   * Release a database connection
   * Only actually closes when ref count reaches 0
   */
  releaseConnection(dbPath: string): void {
    const refCount = this.refCounts.get(dbPath) || 0;
    
    if (refCount <= 0) {
      console.log(`[DatabaseManager] No references for: ${dbPath}`);
      return;
    }

    const newRefCount = refCount - 1;
    this.refCounts.set(dbPath, newRefCount);
    
    console.log(`[DatabaseManager] Released connection (refs: ${newRefCount})`);

    if (newRefCount === 0) {
      // Actually close the connection
      const db = this.connections.get(dbPath);
      if (db) {
        try {
          db.close();
          console.log(`[DatabaseManager] ✓ Connection closed: ${dbPath}`);
        } catch (error: any) {
          console.error(`[DatabaseManager] Error closing connection:`, error.message);
        }
      }
      this.connections.delete(dbPath);
      this.refCounts.delete(dbPath);
    }
  }

  /**
   * Close all connections
   */
  closeAll(): void {
    console.log(`[DatabaseManager] Closing all connections (${this.connections.size} total)`);
    
    for (const [dbPath, db] of this.connections.entries()) {
      try {
        db.close();
        console.log(`[DatabaseManager] ✓ Closed: ${dbPath}`);
      } catch (error: any) {
        console.error(`[DatabaseManager] Error closing ${dbPath}:`, error.message);
      }
    }
    
    this.connections.clear();
    this.refCounts.clear();
    console.log(`[DatabaseManager] All connections closed`);
  }

  /**
   * Get status information
   */
  getStatus() {
    return {
      totalConnections: this.connections.size,
      connections: Array.from(this.connections.keys()),
      refCounts: Object.fromEntries(this.refCounts.entries()),
    };
  }
}

export const dbManager = DatabaseManager.getInstance();

