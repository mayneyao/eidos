/**
 * Graft Extension Loader for React Native
 * 
 * Note: Loading native SQLite extensions in React Native/Expo is challenging.
 * This implementation provides the infrastructure, but actual extension loading
 * depends on having custom native modules built for iOS/Android.
 * 
 * For Phase 1 (local-only), this module is not used.
 * For Phase 2 (sync), this will need platform-specific native bridge work.
 */

import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

export interface GraftConfig {
  enabled: boolean;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  bucketName?: string;
  region?: string;
}

export interface GraftEnvironment {
  GRAFT_CONFIG: string;
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
  AWS_REGION?: string;
  AWS_ENDPOINT?: string;
}

class GraftLoader {
  private isInitialized = false;
  private config: GraftConfig | null = null;

  /**
   * Initialize graft with configuration
   * Note: Actual extension loading requires custom native modules
   */
  async initialize(config: GraftConfig): Promise<boolean> {
    if (!config.enabled) {
      console.log('Graft sync is disabled');
      return false;
    }

    this.config = config;

    try {
      // Create graft directory structure
      const graftDir = `${FileSystem.documentDirectory}.eidos/.graft/`;
      const dirInfo = await FileSystem.getInfoAsync(graftDir);
      
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(graftDir, { intermediates: true });
      }

      // Create graft.toml config file
      await this.createGraftConfig(graftDir);

      console.log('Graft configuration initialized at:', graftDir);
      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error('Failed to initialize graft:', error);
      return false;
    }
  }

  private async createGraftConfig(graftDir: string): Promise<void> {
    if (!this.config) throw new Error('Graft config not set');

    const configContent = `
data_dir = "${graftDir}"

[remote]
type = "s3_compatible"
bucket = "${this.config.bucketName || 'eidos-sync'}"
prefix = "capture"
`.trim();

    const configPath = `${graftDir}graft.toml`;
    await FileSystem.writeAsStringAsync(configPath, configContent);
  }

  /**
   * Get environment variables for graft extension
   */
  getEnvironment(): GraftEnvironment | null {
    if (!this.config || !this.config.enabled) return null;

    const graftDir = `${FileSystem.documentDirectory}.eidos/.graft/`;
    
    return {
      GRAFT_CONFIG: `${graftDir}graft.toml`,
      AWS_ACCESS_KEY_ID: this.config.accessKeyId,
      AWS_SECRET_ACCESS_KEY: this.config.secretAccessKey,
      AWS_REGION: this.config.region || 'auto',
      AWS_ENDPOINT: this.config.endpoint || 'https://s3.eidos.space',
    };
  }

  /**
   * Check if graft extension can be loaded on this platform
   * Note: Requires custom native modules - not available in standard Expo
   */
  async canLoadExtension(): Promise<boolean> {
    // For now, return false as we don't have custom native modules
    // In the future, check for custom native module availability
    console.warn('Graft extension loading not supported on mobile yet');
    return false;
  }

  /**
   * Load graft extension into SQLite database
   * Note: This requires a custom native module to work
   * 
   * Implementation would look like:
   * - iOS: Load .framework or .dylib via native module
   * - Android: Load .so via JNI
   */
  async loadExtension(db: any): Promise<boolean> {
    if (!this.isInitialized) {
      throw new Error('Graft not initialized. Call initialize() first.');
    }

    // Check if we have the custom native module
    const canLoad = await this.canLoadExtension();
    if (!canLoad) {
      console.warn('Graft extension cannot be loaded on this platform');
      return false;
    }

    try {
      // Future implementation with custom native module:
      // const GraftNativeModule = NativeModules.GraftExtension;
      // await GraftNativeModule.loadExtension(db, this.getEnvironment());
      
      console.log('Graft extension loading not implemented yet');
      return false;
    } catch (error) {
      console.error('Failed to load graft extension:', error);
      return false;
    }
  }

  /**
   * Configure database for graft VFS
   * These pragmas should be set when graft is enabled
   */
  async configureDatabaseForGraft(db: any): Promise<void> {
    try {
      // Set page size to 4096 (required by graft)
      await db.execAsync('PRAGMA page_size = 4096;');
      
      // Use MEMORY journal mode (required by graft)
      await db.execAsync('PRAGMA journal_mode = MEMORY;');
      
      console.log('Database configured for graft VFS');
    } catch (error) {
      console.error('Failed to configure database for graft:', error);
      throw error;
    }
  }

  isGraftEnabled(): boolean {
    return this.isInitialized && this.config?.enabled === true;
  }

  getConfig(): GraftConfig | null {
    return this.config;
  }
}

// Export singleton instance
export const graftLoader = new GraftLoader();

/**
 * Implementation Notes:
 * 
 * To fully support graft on mobile, you would need to:
 * 
 * 1. Create custom native modules:
 *    - iOS: Create a Swift/Objective-C module that can load .dylib/.framework
 *    - Android: Create a Kotlin/Java module that can load .so via JNI
 * 
 * 2. Bundle platform-specific graft extensions:
 *    - iOS: libgraft.framework or libgraft.dylib
 *    - Android: libgraft.so (arm64-v8a, armeabi-v7a, x86, x86_64)
 * 
 * 3. Integrate with expo-sqlite:
 *    - Expo SQLite uses native SQLite, so extension loading needs native bridge
 *    - Could potentially use expo-modules to create custom native module
 * 
 * 4. Alternative approaches:
 *    - Use expo-dev-client with custom native modules
 *    - Fork expo-sqlite to add extension loading support
 *    - Use direct React Native (not Expo) for more native control
 * 
 * For now, Phase 1 focuses on local-only operation without graft.
 * Phase 2 will implement full sync, which may require custom native work.
 */

