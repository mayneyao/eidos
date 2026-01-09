import { NativeModule, requireNativeModule } from 'expo';

import { ExpoGraftEnvModuleEvents, GraftEnvironmentConfig } from './ExpoGraftEnv.types';

declare class ExpoGraftEnvModule extends NativeModule<ExpoGraftEnvModuleEvents> {
  /**
   * Set environment variables for graft extension
   * These environment variables will be available to the native SQLite extension
   */
  setEnvironmentVariables(config: GraftEnvironmentConfig): Promise<void>;
  
  /**
   * Get current environment variable value
   */
  getEnvironmentVariable(key: string): Promise<string | null>;
  
  /**
   * Clear all graft-related environment variables
   */
  clearEnvironmentVariables(): Promise<void>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<ExpoGraftEnvModule>('ExpoGraftEnv');
