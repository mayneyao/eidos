# Android JNI 修复说明

## 问题

在 Android 9+ (API 28+) 上，使用 Java 反射访问 `ProcessEnvironment` 类会失败，因为这个类被列为隐藏 API。

错误信息：
```
Failed to set environment variable: No field theEnvironment in class Ljava/lang/ProcessEnvironment;
```

## 解决方案

使用 **JNI (Java Native Interface)** 直接调用 POSIX 标准的 `setenv()`, `getenv()`, `unsetenv()` 函数。

## 实现细节

### 1. C++ 原生代码 (`android/src/main/cpp/ExpoGraftEnvModule.cpp`)

创建了三个 JNI 函数：

```cpp
// 设置环境变量
JNIEXPORT jint JNICALL
Java_expo_modules_graftenv_ExpoGraftEnvModule_nativeSetEnv(
    JNIEnv *env, jobject, jstring jkey, jstring jvalue)

// 获取环境变量
JNIEXPORT jstring JNICALL
Java_expo_modules_graftenv_ExpoGraftEnvModule_nativeGetEnv(
    JNIEnv *env, jobject, jstring jkey)

// 删除环境变量
JNIEXPORT jint JNICALL
Java_expo_modules_graftenv_ExpoGraftEnvModule_nativeUnsetEnv(
    JNIEnv *env, jobject, jstring jkey)
```

这些函数直接调用 POSIX 标准的 C 函数：
- `setenv(key, value, 1)` - 设置环境变量（overwrite=1）
- `getenv(key)` - 获取环境变量
- `unsetenv(key)` - 删除环境变量

### 2. Kotlin 模块更新

- 移除了使用反射的代码
- 添加了 `external` 函数声明
- 在静态初始化块中加载原生库：`System.loadLibrary("expograftenv")`

### 3. CMake 配置 (`android/src/main/cpp/CMakeLists.txt`)

```cmake
cmake_minimum_required(VERSION 3.4.1)
project(expograftenv)

add_library(expograftenv SHARED ExpoGraftEnvModule.cpp)
find_library(log-lib log)
target_link_libraries(expograftenv ${log-lib})
```

### 4. Gradle 配置更新

在 `android/build.gradle` 中添加了：

```gradle
android {
  defaultConfig {
    externalNativeBuild {
      cmake {
        cppFlags "-std=c++11"
        arguments "-DANDROID_STL=c++_shared"
      }
    }
    ndk {
      abiFilters 'arm64-v8a', 'armeabi-v7a', 'x86', 'x86_64'
    }
  }
  externalNativeBuild {
    cmake {
      path "src/main/cpp/CMakeLists.txt"
      version "3.22.1"
    }
  }
}
```

## 优势

1. **兼容性好**：适用于所有 Android 版本（包括 Android 9+）
2. **性能高**：直接调用原生函数，无反射开销
3. **可靠性强**：使用标准 POSIX API，不依赖隐藏的 Java API
4. **日志完善**：使用 Android log 输出详细的调试信息

## 环境变量作用域

使用 `setenv()` 设置的环境变量：
- ✅ 对当前进程可见
- ✅ 对通过 JNI 加载的原生库可见（如 Graft 扩展）
- ✅ 对通过 `System.loadLibrary()` 加载的库可见
- ✅ 对子进程可见（如果 fork 的话）

## 构建要求

- **CMake**: 3.4.1 或更高版本
- **NDK**: Android NDK r21 或更高版本（Expo 自动包含）
- **C++ 标准**: C++11

## 重新构建

修改后需要重新构建原生应用：

```bash
cd /Users/mayne/workspace/eidos/apps/capture

# 清理
cd android
./gradlew clean
cd ..

# 重新构建
pnpm run android
```

构建时 Gradle 会自动：
1. 运行 CMake 编译 C++ 代码
2. 为所有指定的 ABI 生成 `.so` 文件
3. 将 `.so` 文件打包到 APK 中

## 验证

构建成功后，会生成以下文件：
```
android/build/intermediates/cmake/debug/obj/
├── arm64-v8a/libexpograftenv.so
├── armeabi-v7a/libexpograftenv.so
├── x86/libexpograftenv.so
└── x86_64/libexpograftenv.so
```

## 调试

在 Android logcat 中查看日志：

```bash
adb logcat | grep ExpoGraftEnv
```

日志输出示例：
```
D/ExpoGraftEnv: Setting env: AWS_ACCESS_KEY_ID=xxx
D/ExpoGraftEnv: Successfully set AWS_ACCESS_KEY_ID
D/ExpoGraftEnv: Setting env: GRAFT_CONFIG=/data/user/0/.../files/graft.toml
D/ExpoGraftEnv: Successfully set GRAFT_CONFIG
```

## 测试

```typescript
import ExpoGraftEnv from './expo-graft-env';

// 设置环境变量
await ExpoGraftEnv.setEnvironmentVariables({
  AWS_ACCESS_KEY_ID: 'test-key',
  AWS_ENDPOINT: 'https://s3.example.com',
});

// 验证
const value = await ExpoGraftEnv.getEnvironmentVariable('AWS_ACCESS_KEY_ID');
console.log('Value:', value); // 应该输出: test-key
```

## 常见问题

### Q: 构建时找不到 CMake
A: Expo 的 NDK 应该自带 CMake。如果报错，可以通过 Android Studio 的 SDK Manager 安装 CMake。

### Q: JNI 函数签名不匹配
A: 确保 Kotlin 中的包名路径与 C++ 中的函数名匹配：
```
expo.modules.graftenv → expo_modules_graftenv
```

### Q: 环境变量对 Graft 不可见
A: 确保在加载 Graft 扩展之前调用 `setEnvironmentVariables()`。

## 与 iOS 对比

| 平台 | 实现方式 | API |
|------|---------|-----|
| Android | JNI + C++ | `setenv()`, `getenv()`, `unsetenv()` |
| iOS | Swift | `setenv()`, `getenv()`, `unsetenv()` |

两个平台都使用相同的 POSIX 标准函数，保证了一致性。

## 参考

- [Android NDK 文档](https://developer.android.com/ndk)
- [JNI 规范](https://docs.oracle.com/javase/8/docs/technotes/guides/jni/spec/jniTOC.html)
- [POSIX setenv()](https://man7.org/linux/man-pages/man3/setenv.3.html)
- [Android Hidden API Restrictions](https://developer.android.com/guide/app-compatibility/restrictions-non-sdk-interfaces)

