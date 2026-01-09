/**
 * Sync Manager
 * Coordinates database sync (via graft) and file sync
 */

import { database } from '../db/database';
import { graftLoader, GraftConfig } from '../db/graft-loader';
import { fileSynchronizer, MobileFileSynchronizer, MobileSyncConfig, SyncStats } from './file-sync-mobile';
import { SyncConfig } from '../db/types';

export interface SyncStatus {
  enabled: boolean;
  lastSync: number | null;
  inProgress: boolean;
  syncMode: 'graft-vfs' | 'file-level' | 'disabled';
  fileStats?: SyncStats;
  error?: string;
}

class SyncManager {
  private syncConfig: SyncConfig | null = null;
  private lastSyncTime: number | null = null;
  private syncInProgress = false;
  private syncMode: 'graft-vfs' | 'file-level' | 'disabled' = 'disabled';

  async initialize(): Promise<void> {
    try {
      // Load sync config from database
      const configStr = await database.getSetting('sync_config');
      if (configStr) {
        this.syncConfig = JSON.parse(configStr);
        
        // Migration: Write sync config to file if it doesn't exist yet
        // This ensures future app startups can detect sync config without opening database
        try {
          await database.setSetting('sync_config', configStr);
          console.log('Sync config migrated to file');
        } catch (error) {
          console.warn('Failed to migrate sync config to file:', error);
        }
      }

      if (this.syncConfig?.enabled) {
        await this.setupSync();
      }
    } catch (error) {
      console.error('Failed to initialize sync manager:', error);
    }
  }

  private async setupSync(): Promise<void> {
    if (!this.syncConfig || !this.syncConfig.enabled) {
      this.syncMode = 'disabled';
      return;
    }

    try {
      // Try to setup graft VFS (database sync)
      console.log('Attempting to initialize graft VFS mode...');
      
      const graftConfig: GraftConfig = {
        enabled: true,
        endpoint: this.syncConfig.endpoint,
        accessKeyId: this.syncConfig.accessKeyId,
        secretAccessKey: this.syncConfig.secretAccessKey,
        bucketName: this.syncConfig.bucketName,
        region: this.syncConfig.region || 'auto',
      };

      const graftInitialized = await graftLoader.initialize(graftConfig);
      console.log(`Graft initialized: ${graftInitialized}`);
      console.log(`Graft using native VFS: ${graftLoader.isUsingNativeVFS()}`);
      
      if (graftInitialized && graftLoader.isUsingNativeVFS()) {
        console.log('Graft is available');
        
        // Check if database is already using graft
        if (database.isGraftEnabled()) {
          this.syncMode = 'graft-vfs';
          console.log('✓ Graft VFS mode already enabled - database-level sync active');
          return;
        } else {
          console.log('⚠ Graft is available but database was not initialized with it.');
          console.log('   Please restart the app to enable Graft VFS mode.');
          // Don't try to re-init database while it's in use
        }
      } else {
        console.log(`Graft not available. Initialized: ${graftInitialized}, Using VFS: ${graftLoader.isUsingNativeVFS()}`);
      }

      console.log('Using file-level sync');
      
      // Fall back to file-level sync
      if (
        this.syncConfig.endpoint &&
        this.syncConfig.accessKeyId &&
        this.syncConfig.secretAccessKey &&
        this.syncConfig.bucketName
      ) {
        const fileSyncConfig: MobileSyncConfig = {
          endpoint: this.syncConfig.endpoint,
          accessKeyId: this.syncConfig.accessKeyId,
          secretAccessKey: this.syncConfig.secretAccessKey,
          bucketName: this.syncConfig.bucketName,
          region: this.syncConfig.region || 'auto',
          prefix: 'capture/files/', // Prefix for capture files
        };

        await fileSynchronizer.initialize(fileSyncConfig);
        
        // Start auto-sync every 5 minutes
        fileSynchronizer.startAutoSync(5 * 60 * 1000);
        
        this.syncMode = 'file-level';
        console.log('✓ File-level sync mode enabled');
      }
    } catch (error) {
      console.error('Failed to setup sync:', error);
      this.syncMode = 'disabled';
      throw error;
    }
  }

  async updateConfig(config: SyncConfig): Promise<void> {
    const wasEnabled = this.syncConfig?.enabled;
    this.syncConfig = config;

    // Save to database
    await database.setSetting('sync_config', JSON.stringify(config));

    // Update graft configuration if available
    // Note: We need to import graftLoader here, but to avoid circular imports,
    // we'll update the graft config when the loader is initialized
    try {
      // This will be called when graft loader is available
      // For now, the config will be updated when graft initializes
      console.log('Sync config updated, graft config will be refreshed on next initialization');
    } catch (error) {
      console.warn('Failed to update graft config:', error);
    }

    if (config.enabled && !wasEnabled) {
      // Sync was just enabled
      await this.setupSync();
    } else if (!config.enabled && wasEnabled) {
      // Sync was just disabled
      this.stopSync();
    } else if (config.enabled) {
      // Config changed while enabled - restart sync
      this.stopSync();
      await this.setupSync();
    }
  }

  private stopSync(): void {
    fileSynchronizer.stopAutoSync();
    console.log('Sync stopped');
  }

  async performSync(): Promise<SyncStatus> {
    if (this.syncInProgress) {
      return {
        enabled: this.syncConfig?.enabled || false,
        lastSync: this.lastSyncTime,
        inProgress: true,
      };
    }

    if (!this.syncConfig?.enabled) {
      return {
        enabled: false,
        lastSync: null,
        inProgress: false,
        error: 'Sync is not enabled',
      };
    }

    this.syncInProgress = true;

    try {
      console.log('Starting manual sync...');

      // Sync files
      const fileStats = await fileSynchronizer.sync();

      // Mark all captures as synced (since graft handles DB sync)
      const unsyncedCaptures = await database.getUnsyncedCaptures();
      for (const capture of unsyncedCaptures) {
        await database.markCaptureAsSynced(capture.id);
      }

      this.lastSyncTime = Date.now();

      return {
        enabled: true,
        lastSync: this.lastSyncTime,
        inProgress: false,
        fileStats,
      };
    } catch (error) {
      console.error('Sync failed:', error);
      return {
        enabled: true,
        lastSync: this.lastSyncTime,
        inProgress: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    } finally {
      this.syncInProgress = false;
    }
  }

  getStatus(): SyncStatus {
    return {
      enabled: this.syncConfig?.enabled || false,
      lastSync: this.lastSyncTime,
      inProgress: this.syncInProgress || fileSynchronizer.isSyncInProgress(),
      syncMode: this.syncMode,
    };
  }

  /**
   * Get current sync mode
   */
  getSyncMode(): 'graft-vfs' | 'file-level' | 'disabled' {
    return this.syncMode;
  }

  isEnabled(): boolean {
    return this.syncConfig?.enabled || false;
  }

  getConfig(): SyncConfig | null {
    return this.syncConfig;
  }
}

// Export singleton instance
export const syncManager = new SyncManager();

