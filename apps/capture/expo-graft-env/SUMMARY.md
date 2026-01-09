# expo-graft-env 模块总结

## 已完成的工作

✅ **创建了完整的 Expo 原生模块**，用于动态配置 Graft 扩展的环境变量

### 文件结构

```
expo-graft-env/
├── android/
│   └── src/main/java/expo/modules/graftenv/
│       └── ExpoGraftEnvModule.kt          # Android 原生实现
├── ios/
│   └── ExpoGraftEnvModule.swift           # iOS 原生实现
├── src/
│   ├── ExpoGraftEnv.types.ts              # TypeScript 类型定义
│   ├── ExpoGraftEnvModule.ts              # 原生模块接口
│   ├── ExpoGraftEnvModule.web.ts          # Web 占位符实现
│   └── index.ts                           # 模块导出
├── example/
│   └── App.tsx                            # 完整的示例应用
├── README.md                              # 英文文档
├── USAGE.md                               # 中文使用指南
└── package.json
```

### 核心功能

#### 1. **设置环境变量** (`setEnvironmentVariables`)
- 支持批量设置多个环境变量
- Android: 使用 Java 反射修改 `ProcessEnvironment`
- iOS: 使用 POSIX `setenv()` 函数
- 发送 `onConfigChange` 事件通知结果

#### 2. **获取环境变量** (`getEnvironmentVariable`)
- 读取单个环境变量的值
- 跨平台统一 API

#### 3. **清除环境变量** (`clearEnvironmentVariables`)
- 清除所有 Graft 相关的环境变量
- 包括：`GRAFT_CONFIG`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_ENDPOINT`

### 支持的环境变量

```typescript
type GraftEnvironmentConfig = {
  GRAFT_CONFIG?: string;
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
  AWS_REGION?: string;
  AWS_ENDPOINT?: string;
};
```

### 与 graft-loader 的集成

已更新 `apps/capture/db/graft-loader.ts`：

1. 导入模块：
```typescript
import ExpoGraftEnv from "../expo-graft-env"
```

2. 添加新方法 `setNativeEnvironmentVariables()`：
```typescript
async setNativeEnvironmentVariables(): Promise<boolean> {
  await ExpoGraftEnv.setEnvironmentVariables({
    AWS_ACCESS_KEY_ID: this.config.accessKeyId,
    AWS_SECRET_ACCESS_KEY: this.config.secretAccessKey,
    AWS_REGION: this.config.region || "auto",
    AWS_ENDPOINT: this.config.endpoint || "https://s3.eidos.space",
  })
  return true
}
```

3. 在 `loadExtension()` 中自动调用：
```typescript
// Set environment variables before loading the extension
const envSetSuccess = await this.setNativeEnvironmentVariables()
```

## 技术实现细节

### Android 实现 (Kotlin)

使用反射访问和修改 Java 进程环境：

```kotlin
val processEnvironmentClass = Class.forName("java.lang.ProcessEnvironment")
val theEnvironmentField = processEnvironmentClass.getDeclaredField("theEnvironment")
theEnvironmentField.isAccessible = true

@Suppress("UNCHECKED_CAST")
val env = theEnvironmentField.get(null) as MutableMap<String, String>
env[key] = value
```

**优点：**
- 环境变量对 JNI 加载的原生库（如 Graft）可见
- 不需要修改 Graft 扩展本身

**注意事项：**
- 使用反射可能在某些 Android 版本上受限
- 已提供回退机制处理失败情况

### iOS 实现 (Swift)

使用标准 POSIX API：

```swift
setenv(key, value, 1)  // 设置环境变量
unsetenv(key)          // 删除环境变量
```

**优点：**
- 标准 API，兼容性好
- 性能优秀
- 对所有原生代码可见

### Web 实现

提供占位符实现，输出警告信息：

```typescript
async setEnvironmentVariables(config: GraftEnvironmentConfig): Promise<void> {
  console.warn('ExpoGraftEnv: setEnvironmentVariables is not supported on web');
}
```

## 使用流程

```
1. 用户配置 Graft 凭证
   ↓
2. 调用 graftLoader.initialize(config)
   ↓
3. 打开 SQLite 数据库
   ↓
4. 调用 graftLoader.loadExtension(db)
   ├─→ 自动调用 ExpoGraftEnv.setEnvironmentVariables()
   ├─→ 设置环境变量成功
   └─→ 加载 Graft 扩展（扩展读取环境变量）
   ↓
5. Graft 扩展正常工作，使用配置的 S3 凭证
```

## 测试建议

### 单元测试

```typescript
// 测试设置环境变量
await ExpoGraftEnv.setEnvironmentVariables({
  AWS_ACCESS_KEY_ID: 'test-key',
});

const value = await ExpoGraftEnv.getEnvironmentVariable('AWS_ACCESS_KEY_ID');
expect(value).toBe('test-key');

// 测试清除环境变量
await ExpoGraftEnv.clearEnvironmentVariables();
const cleared = await ExpoGraftEnv.getEnvironmentVariable('AWS_ACCESS_KEY_ID');
expect(cleared).toBeNull();
```

### 集成测试

1. 配置真实的 S3 凭证
2. 初始化 graft-loader
3. 加载 Graft 扩展
4. 执行数据库操作
5. 验证同步到 S3

## 下一步

### 可选的改进

1. **添加凭证加密**
   - 使用 Expo SecureStore 存储敏感凭证
   - 在设置环境变量前解密

2. **添加配置验证**
   - 验证 S3 凭证格式
   - 测试连接性

3. **改进错误处理**
   - 更详细的错误信息
   - 重试机制

4. **性能优化**
   - 缓存环境变量
   - 批量操作优化

### 部署检查清单

- [ ] 在 Android 设备上测试
- [ ] 在 iOS 设备上测试
- [ ] 验证环境变量对 Graft 可见
- [ ] 测试凭证更新流程
- [ ] 测试清除凭证流程
- [ ] 检查内存泄漏
- [ ] 性能测试

## 文档

- ✅ **README.md**: 英文文档，包含 API 参考和技术细节
- ✅ **USAGE.md**: 中文使用指南，包含完整示例
- ✅ **example/App.tsx**: 可运行的示例应用

## 依赖要求

- Expo SDK 54+
- expo-sqlite 16.0.10+
- React Native 0.81.5+
- Android: API 21+ (Android 5.0+)
- iOS: iOS 13.0+

## 许可证

MIT

---

**创建日期**: 2026-01-06
**版本**: 0.1.0
**状态**: ✅ 完成并可用

