/**
 * React hook for sync functionality
 */

import { useState, useEffect, useCallback } from 'react';
import { syncManager, SyncStatus } from '../sync/sync-manager';
import { SyncConfig } from '../db/types';

export function useSync() {
  const [status, setStatus] = useState<SyncStatus>({
    enabled: false,
    lastSync: null,
    inProgress: false,
  });
  const [config, setConfig] = useState<SyncConfig | null>(null);

  const refreshStatus = useCallback(() => {
    const currentStatus = syncManager.getStatus();
    setStatus(currentStatus);
    
    const currentConfig = syncManager.getConfig();
    setConfig(currentConfig);
  }, []);

  useEffect(() => {
    // Initialize sync manager
    syncManager.initialize().then(refreshStatus);

    // Refresh status periodically
    const interval = setInterval(refreshStatus, 5000);

    return () => clearInterval(interval);
  }, [refreshStatus]);

  const performSync = useCallback(async () => {
    const result = await syncManager.performSync();
    setStatus(result);
    return result;
  }, []);

  const updateConfig = useCallback(async (newConfig: SyncConfig) => {
    await syncManager.updateConfig(newConfig);
    setConfig(newConfig);
    refreshStatus();
  }, [refreshStatus]);

  return {
    status,
    config,
    performSync,
    updateConfig,
    refreshStatus,
  };
}

