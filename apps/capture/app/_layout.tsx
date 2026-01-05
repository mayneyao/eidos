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
        
        // Initialize database
        await database.initialize();
        console.log('Database initialized');
        
        // Initialize file manager
        await fileManager.initialize();
        console.log('File manager initialized');
        
        // Initialize sync manager
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
