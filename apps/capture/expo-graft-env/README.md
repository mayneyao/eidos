# expo-graft-env

A native Expo module for dynamically configuring environment variables for the Graft SQLite extension.

## Overview

This module provides native APIs (Android/iOS) to set environment variables at runtime, which is essential for configuring the Graft extension with S3-compatible storage credentials.

## Features

- ✅ Set environment variables dynamically at runtime
- ✅ Support for Android (using JNI reflection)
- ✅ Support for iOS (using `setenv`)
- ✅ Type-safe TypeScript API
- ✅ Event-based feedback for configuration changes
- ✅ Web placeholder (logs warnings)

## Installation

This module is designed to be used as a local module in your Expo project.

```bash
# In your app's package.json, add:
{
  "dependencies": {
    "expo-graft-env": "file:./expo-graft-env"
  }
}
```

Then run:
```bash
npm install
# or
pnpm install
```

## Usage

### Basic Usage

```typescript
import ExpoGraftEnv from 'expo-graft-env';
import type { GraftEnvironmentConfig } from 'expo-graft-env';

// Set environment variables for graft
const config: GraftEnvironmentConfig = {
  AWS_ACCESS_KEY_ID: 'your-access-key',
  AWS_SECRET_ACCESS_KEY: 'your-secret-key',
  AWS_REGION: 'auto',
  AWS_ENDPOINT: 'https://s3.eidos.space',
};

await ExpoGraftEnv.setEnvironmentVariables(config);
```

### Integrated Usage with Graft Loader

```typescript
import { graftLoader } from './db/graft-loader';

// Initialize graft with configuration
await graftLoader.initialize({
  enabled: true,
  endpoint: 'https://s3.eidos.space',
  accessKeyId: 'your-access-key',
  secretAccessKey: 'your-secret-key',
  bucketName: 'your-bucket',
  region: 'auto',
});

// Load the extension (environment variables will be set automatically)
const db = await SQLite.openDatabaseAsync('mydb.db');
await graftLoader.loadExtension(db);
```

### API Reference

#### `setEnvironmentVariables(config: GraftEnvironmentConfig): Promise<void>`

Sets multiple environment variables at once.

**Parameters:**
- `config`: Object containing environment variables to set
  - `GRAFT_CONFIG?`: Path to graft config file (optional)
  - `AWS_ACCESS_KEY_ID?`: AWS access key ID
  - `AWS_SECRET_ACCESS_KEY?`: AWS secret access key
  - `AWS_REGION?`: AWS region
  - `AWS_ENDPOINT?`: S3-compatible endpoint URL

**Returns:** Promise that resolves when variables are set

**Example:**
```typescript
await ExpoGraftEnv.setEnvironmentVariables({
  AWS_ACCESS_KEY_ID: 'AKIAIOSFODNN7EXAMPLE',
  AWS_SECRET_ACCESS_KEY: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  AWS_REGION: 'us-east-1',
  AWS_ENDPOINT: 'https://s3.amazonaws.com',
});
```

#### `getEnvironmentVariable(key: string): Promise<string | null>`

Gets the value of a single environment variable.

**Parameters:**
- `key`: The environment variable name

**Returns:** Promise that resolves to the variable value or null if not set

**Example:**
```typescript
const accessKey = await ExpoGraftEnv.getEnvironmentVariable('AWS_ACCESS_KEY_ID');
console.log('Access Key:', accessKey);
```

#### `clearEnvironmentVariables(): Promise<void>`

Clears all graft-related environment variables.

**Returns:** Promise that resolves when variables are cleared

**Example:**
```typescript
await ExpoGraftEnv.clearEnvironmentVariables();
```

### Events

The module emits `onConfigChange` events when configuration changes occur:

```typescript
import { EventSubscription } from 'expo-modules-core';

const subscription: EventSubscription = ExpoGraftEnv.addListener(
  'onConfigChange',
  (event) => {
    console.log('Config change:', event.success, event.message);
  }
);

// Later, cleanup
subscription.remove();
```

## Platform Support

- ✅ **Android**: Uses reflection to modify the process environment map
- ✅ **iOS**: Uses native `setenv()` system call
- ⚠️ **Web**: Placeholder implementation (logs warnings)

## Technical Details

### Android Implementation

On Android, the module uses Java reflection to access and modify the `ProcessEnvironment.theEnvironment` map. This allows setting environment variables that are visible to native code (JNI/C++) loaded by the app.

### iOS Implementation

On iOS, the module uses the standard `setenv()` POSIX function to set environment variables in the process environment.

### Why Environment Variables?

The Graft SQLite extension is a native C library that reads its configuration from environment variables. Since Graft runs in the same process as your app, setting environment variables before loading the extension ensures proper configuration.

## Troubleshooting

### Environment variables not visible to Graft

Make sure to call `setEnvironmentVariables()` **before** loading the Graft extension with `loadExtensionAsync()`.

### Android reflection errors

If you encounter reflection errors on Android, ensure your app has the necessary permissions and is not being restricted by security policies.

### iOS setenv errors

On iOS, `setenv()` should always work, but make sure you're calling it before the Graft library initialization.

## License

MIT

## Contributing

This module is part of the Eidos project. Contributions are welcome!

