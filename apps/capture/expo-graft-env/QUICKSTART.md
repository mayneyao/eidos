# 快速开始指南

## 🚀 5 分钟快速集成

### 步骤 1: 安装模块

模块已经在项目中，只需安装依赖：

```bash
cd /Users/mayne/workspace/eidos/apps/capture
pnpm install
```

### 步骤 2: 重新构建原生应用

**重要**: 这是一个原生模块，必须重新构建应用：

```bash
# Android
pnpm run android

# iOS
pnpm run ios
```

### 步骤 3: 使用模块

模块已经集成到 `graft-loader.ts` 中，你只需要正常使用 graft-loader：

```typescript
import { graftLoader } from './db/graft-loader';
import * as SQLite from 'expo-sqlite';

// 1. 初始化配置
await graftLoader.initialize({
  enabled: true,
  endpoint: 'https://s3.eidos.space',
  accessKeyId: 'your-access-key-id',
  secretAccessKey: 'your-secret-access-key',
  bucketName: 'your-bucket-name',
  region: 'auto',
});

// 2. 打开数据库
const db = await SQLite.openDatabaseAsync('mydb.db');

// 3. 加载 Graft 扩展（环境变量会自动设置）
const success = await graftLoader.loadExtension(db);

if (success) {
  console.log('✅ Graft 已启用，数据将自动同步到 S3');
} else {
  console.log('⚠️ Graft 加载失败，使用本地模式');
}
```

就这么简单！环境变量会在 `loadExtension()` 内部自动设置。

## 🔍 验证环境变量

如果你想验证环境变量是否正确设置：

```typescript
import ExpoGraftEnv from './expo-graft-env';

// 检查环境变量
const accessKey = await ExpoGraftEnv.getEnvironmentVariable('AWS_ACCESS_KEY_ID');
const endpoint = await ExpoGraftEnv.getEnvironmentVariable('AWS_ENDPOINT');

console.log('Access Key:', accessKey);
console.log('Endpoint:', endpoint);
```

## 🎯 完整示例

查看 `expo-graft-env/example/App.tsx` 获取完整的 UI 示例。

运行示例应用：

```bash
cd expo-graft-env/example
npm install
npm run android  # 或 npm run ios
```

## 📱 平台支持

- ✅ **Android**: 完全支持（使用 Java 反射）
- ✅ **iOS**: 完全支持（使用 setenv）
- ⚠️ **Web**: 占位符实现（仅输出警告）

## ⚠️ 常见问题

### Q: 环境变量没有生效？

**A**: 确保：
1. 在加载 Graft 扩展**之前**设置环境变量
2. 重新构建了原生应用（不能使用 Expo Go）
3. 使用 Dev Client 或独立构建

### Q: 如何更新凭证？

**A**: 调用 `graftLoader.updateConfig()` 然后重新加载扩展：

```typescript
await graftLoader.updateConfig({
  enabled: true,
  accessKeyId: 'new-key',
  secretAccessKey: 'new-secret',
  // ...
});

// 重新打开数据库并加载扩展
const db = await SQLite.openDatabaseAsync('mydb.db');
await graftLoader.loadExtension(db);
```

### Q: 如何清除凭证？

**A**: 使用 `clearEnvironmentVariables()`：

```typescript
import ExpoGraftEnv from './expo-graft-env';
await ExpoGraftEnv.clearEnvironmentVariables();
```

## 🔐 安全建议

1. **不要硬编码凭证**
   ```typescript
   // ❌ 不要这样做
   const config = {
     accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
     secretAccessKey: 'hardcoded-secret',
   };
   ```

2. **使用 SecureStore**
   ```typescript
   // ✅ 推荐做法
   import * as SecureStore from 'expo-secure-store';
   
   const accessKeyId = await SecureStore.getItemAsync('aws_access_key_id');
   const secretAccessKey = await SecureStore.getItemAsync('aws_secret_access_key');
   ```

3. **在生产环境使用环境变量或配置服务**

## 📚 更多文档

- **README.md**: 完整的 API 参考和技术细节
- **USAGE.md**: 详细的使用指南和示例
- **SUMMARY.md**: 项目总结和实现细节

## 🆘 需要帮助？

如果遇到问题：

1. 检查日志输出
   ```bash
   # Android
   adb logcat | grep -E "ExpoGraftEnv|Graft"
   
   # iOS
   # 在 Xcode 中查看控制台
   ```

2. 验证环境变量
   ```typescript
   const keys = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION', 'AWS_ENDPOINT'];
   for (const key of keys) {
     const value = await ExpoGraftEnv.getEnvironmentVariable(key);
     console.log(`${key}:`, value ? '✓ Set' : '✗ Not set');
   }
   ```

3. 查看示例应用了解正确用法

---

**祝你使用愉快！** 🎉

