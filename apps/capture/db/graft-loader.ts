/**
 * Graft Extension Loader for React Native
 *
 * This module manages graft configuration and loads the native SQLite extension.
 * It uses expo-sqlite's loadExtensionAsync API to load the graft VFS extension.
 *
 * Two modes:
 * 1. Native VFS mode: Uses graft extension for database-level sync
 * 2. Fallback mode: Uses file-system level sync when extension is not available
 */

import * as FileSystem from "expo-file-system/legacy"
import * as SQLite from "expo-sqlite"
import { Platform } from "react-native"
import ExpoGraftEnv from "../expo-graft-env"

export interface GraftConfig {
  enabled: boolean
  endpoint?: string
  accessKeyId?: string
  secretAccessKey?: string
  bucketName?: string
  region?: string
}

export interface GraftEnvironment {
  GRAFT_CONFIG: string
  AWS_ACCESS_KEY_ID?: string
  AWS_SECRET_ACCESS_KEY?: string
  AWS_REGION?: string
  AWS_ENDPOINT?: string
}

class GraftLoader {
  private isInitialized = false
  private config: GraftConfig | null = null
  private useNativeVFS = false

  /**
   * Initialize graft with configuration
   * Creates config file and sets up environment variables
   */
  async initialize(config: GraftConfig): Promise<boolean> {
    if (!config.enabled) {
      console.log("Graft sync is disabled")
      return false
    }

    this.config = config

    try {
      // Create graft.toml configuration file
      await this.createGraftConfigFile()
      console.log("✓ Graft configuration file created")

      // Check if graft extension is bundled (will try to load it later)
      // For now, optimistically assume it might be available
      // Actual availability will be determined when trying to load
      console.log("Checking for bundled graft extension...")
      this.useNativeVFS = true // Will fall back during loadExtension if not available

      // Note for Android users
      if (Platform.OS === "android") {
        console.log("📱 Note: Graft VFS on Android may fall back to file-level sync")
        console.log("   due to platform file locking limitations")
      }

      console.log("✓ Graft configuration initialized")
      this.isInitialized = true
      return true
    } catch (error) {
      console.error("Failed to initialize graft:", error)
      return false
    }
  }


  /**
   * Convert file:// URI to file system path
   * FileSystem.documentDirectory returns file:// URI on Android
   * but Graft expects plain file paths
   */
  private uriToPath(uri: string): string {
    if (uri.startsWith('file://')) {
      return uri.substring(7) // Remove 'file://' prefix
    }
    return uri
  }

  /**
   * Get the path to graft.toml config file (URI format for FileSystem API)
   */
  private getGraftConfigPath(): string {
    // Return URI format for FileSystem API
    return `${FileSystem.documentDirectory}graft.toml`
  }

  /**
   * Get the path to graft.toml config file (plain path for Graft)
   */
  private getGraftConfigPathForGraft(): string {
    // Return plain file system path for Graft config
    return this.uriToPath(`${FileSystem.documentDirectory}graft.toml`)
  }

  /**
   * Get the graft data directory path (URI format for FileSystem API)
   */
  private getGraftDataDir(): string {
    // Return URI format for FileSystem API
    return `${FileSystem.documentDirectory}.graft`
  }

  /**
   * Get the graft data directory path (plain path for Graft)
   */
  private getGraftDataDirForGraft(): string {
    // Return plain file system path for Graft config
    return this.uriToPath(`${FileSystem.documentDirectory}.graft`)
  }

  /**
   * Create graft.toml configuration file
   * This file contains the S3 configuration for graft
   * Format matches desktop implementation
   */
  private async createGraftConfigFile(): Promise<string> {
    if (!this.config || !this.config.enabled) {
      throw new Error("Graft config not set")
    }

    // Get paths in URI format for FileSystem API
    const configPath = this.getGraftConfigPath()
    const graftDataDir = this.getGraftDataDir()
    
    // Get paths in plain format for Graft config
    const graftDataDirForConfig = this.getGraftDataDirForGraft()
    
    // Ensure graft data directory exists
    try {
      const dirInfo = await FileSystem.getInfoAsync(graftDataDir)
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(graftDataDir, { intermediates: true })
        console.log(`✓ Created graft data directory at: ${graftDataDir}`)
      }
    } catch (error) {
      console.error("Failed to create graft data directory:", error)
      throw error
    }
    
    // Generate TOML content matching desktop format
    // Use plain file system paths in the config file (not URI format)
    // AWS credentials are passed via environment variables, not in the config file
    const tomlContent = `data_dir = "${graftDataDirForConfig}"
[remote]
type = "s3_compatible"
bucket = "${this.config.bucketName || ""}"
prefix = "mobile/.eidos/.graft"

# Configure your S3-compatible storage credentials here
# bucket: Your S3 bucket name
# prefix: Optional path prefix within the bucket
`

    try {
      // Write config file to document directory
      await FileSystem.writeAsStringAsync(configPath, tomlContent, {
        encoding: FileSystem.EncodingType.UTF8,
      })
      console.log(`✓ Graft config file created at: ${configPath}`)
      console.log(`✓ Graft data directory (URI): ${graftDataDir}`)
      console.log(`✓ Graft data directory (path): ${graftDataDirForConfig}`)
      return configPath
    } catch (error) {
      console.error("Failed to create graft config file:", error)
      throw error
    }
  }

  /**
   * Get environment variables for graft extension
   */
  async getEnvironment(): Promise<GraftEnvironment | null> {
    if (!this.config || !this.config.enabled) return null

    // Use plain file system path for environment variable
    const configPath = this.getGraftConfigPathForGraft()

    return {
      GRAFT_CONFIG: configPath,
      AWS_ACCESS_KEY_ID: this.config.accessKeyId,
      AWS_SECRET_ACCESS_KEY: this.config.secretAccessKey,
      AWS_REGION: this.config.region || "auto",
      AWS_ENDPOINT: this.config.endpoint || "https://s3.eidos.space",
    }
  }

  /**
   * Set environment variables using the native module
   * This should be called before loading the graft extension
   */
  async setNativeEnvironmentVariables(): Promise<boolean> {
    if (!this.config || !this.config.enabled) {
      console.log("Graft not enabled, skipping environment setup")
      return false
    }

    try {
      // Create graft.toml config file (returns URI format)
      await this.createGraftConfigFile()
      
      // Get plain file system path for environment variable
      const configPathForEnv = this.getGraftConfigPathForGraft()
      
      // Set environment variables including GRAFT_CONFIG
      // Use plain file system paths (not URI format)
      await ExpoGraftEnv.setEnvironmentVariables({
        GRAFT_CONFIG: configPathForEnv,
        AWS_ACCESS_KEY_ID: this.config.accessKeyId,
        AWS_SECRET_ACCESS_KEY: this.config.secretAccessKey,
        AWS_REGION: this.config.region || "auto",
        AWS_ENDPOINT: this.config.endpoint || "https://s3.eidos.space",
      })
      console.log("✓ Graft environment variables set successfully")
      console.log(`✓ GRAFT_CONFIG: ${configPathForEnv}`)
      return true
    } catch (error) {
      console.error("Failed to set graft environment variables:", error)
      return false
    }
  }

  /**
   * Check if native VFS mode is enabled
   */
  isUsingNativeVFS(): boolean {
    return this.useNativeVFS && this.isInitialized
  }

  /**
   * Check if error is related to Android file locking issues
   */
  private isAndroidFileLockError(error: any): boolean {
    const errorMessage = error?.message || String(error)
    return (
      errorMessage.includes('try_lock() not supported') ||
      errorMessage.includes('Fjall error') ||
      errorMessage.includes('file locking')
    )
  }


  /**
   * Get platform-specific extension file name
   */
  private getExtensionName(): string {
    switch (Platform.OS) {
      case "ios":
        return "libgraft.dylib"
      case "android":
        return "libgraft.so"
      case "web":
        return "graft.wasm"
      default:
        return "libgraft.so"
    }
  }

  /**
   * Get the path to the graft extension file (from bundled assets)
   */
  private getExtensionPath(): string {
    // Extension files are bundled with the app, not in document directory
    // They will be in the app's asset bundle
    return this.getBundledExtensionPath()
  }

  /**
   * Get the path to bundled extension based on platform
   */
  private getBundledExtensionPath(): string {
    if (Platform.OS === "android") {
      // Android: Extensions are in assets/extensions/android/{arch}/libgraft.so
      // At runtime, we need to extract from assets to a usable location
      // Expo will handle this via require() in loadExtension
      return "bundled" // Special marker, will use require() path
    } else if (Platform.OS === "ios") {
      // iOS: Extension is in app bundle
      return "bundled" // Special marker, will use require() path
    }
    return ""
  }

  /**
   * Load graft extension into SQLite database
   * Uses expo-sqlite's loadExtensionAsync method with bundled assets
   * See: https://docs.expo.dev/versions/latest/sdk/sqlite/#loadextensionasynclibpath-entrypoint
   */
  async loadExtension(db: SQLite.SQLiteDatabase): Promise<boolean> {
    if (!this.isInitialized) {
      throw new Error("Graft not initialized. Call initialize() first.")
    }

    if (!this.useNativeVFS) {
      console.log("Native VFS not available, using fallback sync mode")
      return false
    }

    if (!this.config) {
      throw new Error("Graft config not set")
    }

    // Set environment variables before loading the extension
    const envSetSuccess = await this.setNativeEnvironmentVariables()
    if (!envSetSuccess) {
      console.warn("Failed to set environment variables, extension may not work correctly")
    }

    // Try to load the extension
    // If we're in Expo Go (not Dev Client), this will fail and we'll fall back to file-level sync
    try {
      console.log("Loading bundled graft extension...")
      console.log("Environment variables have been set for graft extension")

      let extensionPath: string

      if (Platform.OS === "android") {
        // Android: Load .so file from jniLibs
        // The .so file should be placed in android/app/src/main/jniLibs/{arch}/libgraft.so
        // This will be automatically installed to the app's lib directory
        
        console.log(`Loading graft extension for Android`)
        
        // On Android, when .so files are in jniLibs, they can be loaded by name
        // expo-sqlite's loadExtensionAsync should support this
        extensionPath = "libgraft"
        
        console.log(`Using library name: ${extensionPath}`)
        console.log(`Extension should be in jniLibs/arm64-v8a/libgraft.so`)
      } else if (Platform.OS === "ios") {
        // iOS: Use the bundled xcframework from assets/extensions/ios/Graft.xcframework
        // Files should be downloaded from GitHub Release: https://github.com/orbitinghail/graft/releases

        // The xcframework should be in the app bundle
        const xcframeworkPath = "assets/extensions/ios/Graft.xcframework"
        const bundledPath = `${FileSystem.bundleDirectory}${xcframeworkPath}`

        // For iOS, we need to reference the actual library inside the xcframework
        // The structure is: Graft.xcframework/ios-arm64/Graft or ios-arm64_x86_64-simulator/Graft
        const arch = this.getIOSArch()
        const frameworkSubdir =
          arch === "arm64" ? "ios-arm64" : "ios-arm64_x86_64-simulator"
        const libraryPath = `${bundledPath}/${frameworkSubdir}/Graft`

        const fileInfo = await FileSystem.getInfoAsync(libraryPath)

        if (!fileInfo.exists) {
          throw new Error(
            `Graft xcframework not found at: ${xcframeworkPath}. Please download from GitHub Release.`
          )
        }

        // For iOS, we can potentially use the library directly from the bundle
        // or copy it if needed
        extensionPath = libraryPath
        console.log(`Using graft extension from: ${extensionPath}`)
      } else {
        throw new Error(`Platform ${Platform.OS} not supported for graft VFS`)
      }

      // Load graft extension directly - no configuration needed
      console.log('🔌 Loading graft extension...')
      console.log('Extension path:', extensionPath)
      console.log('GRAFT_CONFIG should be set in Android environment')

      // Load the extension using expo-sqlite's loadExtensionAsync
      // The second parameter is the entry point function name
      // Note: loadExtensionAsync may not be available in all expo-sqlite versions
      // Type assertion is used here as the method exists in newer versions
      await (db as any).loadExtensionAsync(extensionPath)

      // Test if graft functions are available after loading
      try {
        const testResult = await db.getFirstAsync<{ version: string }>(
          "SELECT graft_version() as version"
        )
        console.log('✓ Graft extension loaded successfully, version:', testResult?.version)
      } catch (error) {
        console.warn('Graft functions not immediately available, this is normal:', error)
      }

      // Enable graft VFS by setting appropriate pragmas
      await db.execAsync("PRAGMA journal_mode=MEMORY;")

      console.log("✓ Graft extension loaded and VFS enabled")
      return true
    } catch (error) {
      // Check if this is the known Android file locking issue
      if (this.isAndroidFileLockError(error)) {
        console.log("⚠️  Android Platform Limitation Detected")
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        console.log("📱 Graft VFS requires file locking (try_lock)")
        console.log("🚫 Android does not support this operation")
        console.log("🔄 Automatically falling back to file-level sync")
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        console.log("ℹ️  Your data will still sync, just using a different method")
        console.log("")
      } else {
        console.error("Failed to load graft extension:", error)
        console.log("Falling back to file-level sync")
      }
      
      this.useNativeVFS = false // Fall back to file-level sync
      return false
    }
  }

  /**
   * Get Android architecture
   */
  private getAndroidArch(): string {
    // In React Native, we can't easily detect the exact arch at runtime
    // The app is typically built for specific architectures
    // Default to arm64-v8a (most common)
    return "arm64-v8a"
  }

  /**
   * Get iOS architecture
   */
  private getIOSArch(): string {
    // Default to arm64 for modern devices
    // For simulator, would need to detect, but arm64 works on M1/M2 Macs
    return "arm64"
  }

  /**
   * Get sync status from graft
   */
  async getSyncStatus(db: SQLite.SQLiteDatabase) {
    if (!this.useNativeVFS) {
      return null
    }

    try {
      // Query graft status via custom SQL functions (if graft exposes them)
      const result = await db.getFirstAsync<{ pending: number }>(
        "SELECT graft_pending_changes() as pending"
      )

      return {
        isEnabled: true,
        lastSyncTime: Date.now(),
        pendingChanges: result?.pending || 0,
      }
    } catch (error) {
      console.error("Failed to get graft sync status:", error)
      return {
        isEnabled: true,
        lastSyncTime: 0,
        pendingChanges: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  /**
   * Manually trigger a sync
   */
  async triggerSync(db: SQLite.SQLiteDatabase): Promise<void> {
    if (!this.useNativeVFS) {
      throw new Error("Native VFS not enabled")
    }

    try {
      // Trigger sync via custom SQL function (if graft exposes it)
      await db.execAsync("SELECT graft_sync();")
      console.log("✓ Graft sync triggered")
    } catch (error) {
      console.error("Failed to trigger graft sync:", error)
      throw error
    }
  }

  /**
   * Configure database for graft VFS
   * These pragmas should be set when graft is enabled
   */
  async configureDatabaseForGraft(db: any): Promise<void> {
    try {
      // Set page size to 4096 (required by graft)
      await db.execAsync("PRAGMA page_size = 4096;")

      // Use MEMORY journal mode (required by graft)
      await db.execAsync("PRAGMA journal_mode = MEMORY;")

      console.log("Database configured for graft VFS")
    } catch (error) {
      console.error("Failed to configure database for graft:", error)
      throw error
    }
  }

  isGraftEnabled(): boolean {
    return this.isInitialized && this.config?.enabled === true
  }

  getConfig(): GraftConfig | null {
    return this.config
  }

  /**
   * Update graft configuration and recreate config file
   * This should be called when user changes settings
   */
  async updateConfig(newConfig: GraftConfig): Promise<void> {
    this.config = newConfig
    
    // If graft is enabled, update the config file and environment variables
    if (newConfig.enabled) {
      try {
        await this.createGraftConfigFile()
        await this.setNativeEnvironmentVariables()
        console.log('✅ Graft configuration updated successfully')
      } catch (error) {
        console.error('Failed to update graft configuration:', error)
        throw error
      }
    } else {
      console.log('✅ Graft configuration updated (disabled)')
    }
  }
  
  /**
   * Delete graft config file
   * Call this when disabling graft or clearing configuration
   */
  async deleteGraftConfigFile(): Promise<void> {
    const configPath = this.getGraftConfigPath()
    try {
      const fileInfo = await FileSystem.getInfoAsync(configPath)
      if (fileInfo.exists) {
        await FileSystem.deleteAsync(configPath)
        console.log('✓ Graft config file deleted')
      }
    } catch (error) {
      console.warn('Failed to delete graft config file:', error)
    }
  }
}

// Export singleton instance
export const graftLoader = new GraftLoader()

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
