import { registerWebModule, NativeModule } from 'expo';

import { ExpoGraftEnvModuleEvents, GraftEnvironmentConfig } from './ExpoGraftEnv.types';

class ExpoGraftEnvModule extends NativeModule<ExpoGraftEnvModuleEvents> {
  async setEnvironmentVariables(config: GraftEnvironmentConfig): Promise<void> {
    console.warn('ExpoGraftEnv: setEnvironmentVariables is not supported on web');
    this.emit('onConfigChange', { 
      success: false, 
      message: 'Environment variables are not supported on web' 
    });
  }

  async getEnvironmentVariable(key: string): Promise<string | null> {
    console.warn('ExpoGraftEnv: getEnvironmentVariable is not supported on web');
    return null;
  }

  async clearEnvironmentVariables(): Promise<void> {
    console.warn('ExpoGraftEnv: clearEnvironmentVariables is not supported on web');
    this.emit('onConfigChange', { 
      success: false, 
      message: 'Environment variables are not supported on web' 
    });
  }
}

export default registerWebModule(ExpoGraftEnvModule, 'ExpoGraftEnvModule');
