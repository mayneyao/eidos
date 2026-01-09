import '../polyfills'; // Must be first import
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { database } from '../db/database';
import { fileManager } from '../storage/file-manager';
import { syncManager } from '../sync/sync-manager';

export default function RootLayout() {
  useEffect(() => {
    // Initialize core services on app startup
    const initializeApp = async () => {
      try {
        console.log('Initializing Eidos Capture app...');
        
        // First, check if sync is configured WITHOUT initializing database
        // This prevents the double-initialization issue
        let enableGraft = false;
        
        console.log('Step 1: Reading sync config...');
        let syncConfig = null;
        try {
          syncConfig = await database.readSyncConfig();
          console.log('Step 1 complete: syncConfig =', syncConfig);
          if (syncConfig?.enabled) {
            enableGraft = true;
            console.log(`Sync config found, graft will be enabled`);
          } else {
            console.log('No sync config or sync disabled, using standard mode');
          }
        } catch (error) {
          console.log('Error reading sync config, using default mode:', error);
        }
        
        // Step 1.5: If graft should be enabled, initialize graftLoader first
        if (enableGraft && syncConfig) {
          console.log('Step 1.5: Pre-initializing graftLoader for database initialization...');
          try {
            const { graftLoader } = await import('../db/graft-loader');
            const graftConfig = {
              enabled: true,
              endpoint: syncConfig.endpoint,
              accessKeyId: syncConfig.accessKeyId,
              secretAccessKey: syncConfig.secretAccessKey,
              bucketName: syncConfig.bucketName,
              region: syncConfig.region || 'auto',
            };
            await graftLoader.initialize(graftConfig);
            console.log('Step 1.5 complete: graftLoader pre-initialized');
          } catch (error) {
            console.error('Failed to pre-initialize graftLoader:', error);
            enableGraft = false; // Fall back to standard mode
          }
        }
        
        // Now initialize database once with the correct mode
        console.log(`Step 2: Initializing database with graft=${enableGraft}...`);
        await database.initialize(enableGraft);
        console.log(`Step 2 complete: Database initialized with graft=${enableGraft}`);
        
        // Initialize file manager
        await fileManager.initialize();
        console.log('File manager initialized');
        
        // Initialize sync manager (will use existing graft state)
        await syncManager.initialize();
        console.log('Sync manager initialized');
        
        console.log('App initialization complete');
      } catch (error) {
        console.error('Failed to initialize app:', error);
      }
    };

    initializeApp();
  }, []);

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen 
          name="settings"
          options={{
            presentation: 'modal',
            animation: 'slide_from_right',
          }}
        />
      </Stack>
    </>
  );
}
