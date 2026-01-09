# 如何使用 expo-graft-env 模块

## 概述

`expo-graft-env` 是一个 Expo 原生模块，用于在运行时动态配置 Graft SQLite 扩展所需的环境变量。

## 为什么需要这个模块？

Graft 是一个 SQLite 扩展，它从环境变量中读取配置（如 AWS S3 凭证）。在 React Native/Expo 应用中，我们需要在加载 Graft 扩展之前动态设置这些环境变量。

## 安装

1. 模块已经在 `apps/capture/expo-graft-env` 目录中
2. 在主应用的 `package.json` 中添加依赖：

```json
{
  "dependencies": {
    "expo-graft-env": "file:./expo-graft-env"
  }
}
```

3. 安装依赖：

```bash
pnpm install
```

4. 重新构建原生应用（必需）：

```bash
# Android
pnpm run android

# iOS
pnpm run ios
```

## 使用方法

### 1. 基本用法

```typescript
import ExpoGraftEnv from './expo-graft-env';

// 设置环境变量
await ExpoGraftEnv.setEnvironmentVariables({
  AWS_ACCESS_KEY_ID: 'your-access-key',
  AWS_SECRET_ACCESS_KEY: 'your-secret-key',
  AWS_REGION: 'auto',
  AWS_ENDPOINT: 'https://s3.eidos.space',
});

// 获取环境变量
const accessKey = await ExpoGraftEnv.getEnvironmentVariable('AWS_ACCESS_KEY_ID');
console.log('Access Key:', accessKey);

// 清除所有 graft 相关的环境变量
await ExpoGraftEnv.clearEnvironmentVariables();
```

### 2. 与 graft-loader 集成使用

`graft-loader.ts` 已经集成了这个模块。当你初始化 graft 时，环境变量会自动设置：

```typescript
import { graftLoader } from './db/graft-loader';
import * as SQLite from 'expo-sqlite';

// 1. 初始化 graft 配置
await graftLoader.initialize({
  enabled: true,
  endpoint: 'https://s3.eidos.space',
  accessKeyId: 'your-access-key',
  secretAccessKey: 'your-secret-key',
  bucketName: 'your-bucket',
  region: 'auto',
});

// 2. 打开数据库
const db = await SQLite.openDatabaseAsync('mydb.db');

// 3. 加载 graft 扩展（会自动设置环境变量）
const success = await graftLoader.loadExtension(db);

if (success) {
  console.log('✓ Graft extension loaded with environment variables');
} else {
  console.log('✗ Failed to load graft extension');
}
```

### 3. 监听配置变化事件

```typescript
import { EventSubscription } from 'expo-modules-core';

const subscription: EventSubscription = ExpoGraftEnv.addListener(
  'onConfigChange',
  (event) => {
    if (event.success) {
      console.log('✓ Config updated:', event.message);
    } else {
      console.error('✗ Config error:', event.message);
    }
  }
);

// 稍后清理
subscription.remove();
```

## API 参考

### `setEnvironmentVariables(config: GraftEnvironmentConfig): Promise<void>`

设置 Graft 所需的环境变量。

**参数：**
- `config.AWS_ACCESS_KEY_ID?`: AWS 访问密钥 ID
- `config.AWS_SECRET_ACCESS_KEY?`: AWS 密钥
- `config.AWS_REGION?`: AWS 区域（默认 "auto"）
- `config.AWS_ENDPOINT?`: S3 兼容端点 URL
- `config.GRAFT_CONFIG?`: Graft 配置文件路径（可选）

**示例：**
```typescript
await ExpoGraftEnv.setEnvironmentVariables({
  AWS_ACCESS_KEY_ID: 'AKIAIOSFODNN7EXAMPLE',
  AWS_SECRET_ACCESS_KEY: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  AWS_REGION: 'us-east-1',
  AWS_ENDPOINT: 'https://s3.amazonaws.com',
});
```

### `getEnvironmentVariable(key: string): Promise<string | null>`

获取单个环境变量的值。

**参数：**
- `key`: 环境变量名称

**返回：**
- 环境变量的值，如果不存在则返回 `null`

**示例：**
```typescript
const endpoint = await ExpoGraftEnv.getEnvironmentVariable('AWS_ENDPOINT');
console.log('Endpoint:', endpoint);
```

### `clearEnvironmentVariables(): Promise<void>`

清除所有 Graft 相关的环境变量。

**示例：**
```typescript
await ExpoGraftEnv.clearEnvironmentVariables();
```

## 工作原理

### Android

在 Android 上，模块使用 Java 反射来修改 `ProcessEnvironment.theEnvironment` 映射。这允许设置对原生代码（JNI/C++）可见的环境变量。

关键代码：
```kotlin
val processEnvironmentClass = Class.forName("java.lang.ProcessEnvironment")
val theEnvironmentField = processEnvironmentClass.getDeclaredField("theEnvironment")
theEnvironmentField.isAccessible = true
val env = theEnvironmentField.get(null) as MutableMap<String, String>
env[key] = value
```

### iOS

在 iOS 上，模块使用标准的 POSIX `setenv()` 函数在进程环境中设置环境变量。

关键代码：
```swift
setenv(key, value, 1)
```

## 注意事项

1. **必须在加载 Graft 扩展之前设置环境变量**
   - Graft 扩展在加载时读取环境变量
   - 加载后修改环境变量不会影响已加载的扩展

2. **需要重新构建原生应用**
   - 这是一个原生模块，修改后需要重新构建 Android/iOS 应用
   - 不能在 Expo Go 中使用，必须使用 Dev Client 或独立构建

3. **环境变量的作用域**
   - 环境变量在整个应用进程中可见
   - 对同一进程中的所有原生代码都有效

4. **安全性**
   - 不要在代码中硬编码敏感凭证
   - 考虑使用 Expo SecureStore 存储凭证
   - 在生产环境中使用适当的密钥管理

## 故障排查

### 环境变量对 Graft 不可见

确保在调用 `loadExtensionAsync()` **之前**调用 `setEnvironmentVariables()`。

### Android 反射错误

如果遇到反射错误，确保应用具有必要的权限，并且没有被安全策略限制。

### iOS setenv 错误

在 iOS 上，`setenv()` 应该总是有效，但要确保在 Graft 库初始化之前调用。

## 示例应用

查看 `example/App.tsx` 以获取完整的示例应用，演示如何使用这个模块。

运行示例：

```bash
cd expo-graft-env/example
npm install
npm run android  # 或 npm run ios
```

## 开发

### 修改模块后

1. 重新构建模块：
```bash
cd expo-graft-env
npm run build
```

2. 重新构建应用：
```bash
cd ..
pnpm run android  # 或 pnpm run ios
```

### 调试

使用 `console.log` 在原生代码中输出调试信息：

**Android (Kotlin):**
```kotlin
android.util.Log.d("ExpoGraftEnv", "Debug message")
```

**iOS (Swift):**
```swift
print("Debug message")
```

查看日志：
```bash
# Android
adb logcat | grep ExpoGraftEnv

# iOS
在 Xcode 中查看控制台输出
```

## 许可证

MIT

