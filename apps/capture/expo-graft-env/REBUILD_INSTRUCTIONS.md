# 重新构建说明

## 修改内容总结

已将 Android 的环境变量设置方式从 **Java 反射** 改为 **JNI (原生 C++)**，以解决 Android 9+ 的隐藏 API 限制问题。

## 需要重新构建！

由于添加了原生 C++ 代码，**必须重新构建应用**。

## 快速操作步骤

### Android

```bash
cd /Users/mayne/workspace/eidos/apps/capture

# 1. 清理构建缓存
cd android
./gradlew clean
cd ..

# 2. 重新构建并运行
pnpm run android
```

### 构建时会发生什么

Gradle 会自动：
1. ✅ 使用 CMake 编译 C++ 代码
2. ✅ 为所有架构生成 `libexpograftenv.so` 文件
3. ✅ 将原生库打包到 APK 中

### 构建成功的标志

在日志中看到类似内容：
```
> Task :expo-graft-env:buildCMakeDebug[arm64-v8a]
Build expograftenv arm64-v8a
```

## 验证安装

应用启动后，在 logcat 中查看：

```bash
adb logcat | grep ExpoGraftEnv
```

成功的日志示例：
```
D/ExpoGraftEnv: Setting env: GRAFT_CONFIG=/data/user/0/.../files/graft.toml
D/ExpoGraftEnv: Successfully set GRAFT_CONFIG
D/ExpoGraftEnv: Setting env: AWS_ACCESS_KEY_ID=xxx
D/ExpoGraftEnv: Successfully set AWS_ACCESS_KEY_ID
```

## 如果遇到问题

### CMake 错误
```bash
# 在 Android Studio SDK Manager 中安装 CMake
# 或者修改 build.gradle 中的 CMake 版本
```

### 构建缓存问题
```bash
cd android
rm -rf build
rm -rf .gradle
./gradlew clean
cd ..
rm -rf node_modules
pnpm install
pnpm run android
```

## iOS (如果需要)

iOS 不需要重新构建，因为 Swift 版本直接调用 `setenv()`，没有使用反射。

## 技术细节

查看 `ANDROID_JNI_FIX.md` 了解完整的技术实现细节。

## 简单来说

**执行这两条命令就可以了**：

```bash
cd /Users/mayne/workspace/eidos/apps/capture/android && ./gradlew clean && cd .. && pnpm run android
```

构建完成后，环境变量设置就能正常工作了！🎉

