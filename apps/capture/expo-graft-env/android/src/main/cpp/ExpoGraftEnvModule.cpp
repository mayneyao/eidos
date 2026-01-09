#include <jni.h>
#include <cstdlib>
#include <cstring>
#include <cerrno>
#include <android/log.h>

#define LOG_TAG "ExpoGraftEnv"
#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

extern "C" {

/**
 * Set an environment variable using setenv()
 * Returns 0 on success, -1 on failure
 */
JNIEXPORT jint JNICALL
Java_expo_modules_graftenv_ExpoGraftEnvModule_nativeSetEnv(
    JNIEnv *env,
    jobject /* this */,
    jstring jkey,
    jstring jvalue) {
    
    if (jkey == nullptr || jvalue == nullptr) {
        LOGE("nativeSetEnv: key or value is null");
        return -1;
    }
    
    const char *key = env->GetStringUTFChars(jkey, nullptr);
    const char *value = env->GetStringUTFChars(jvalue, nullptr);
    
    if (key == nullptr || value == nullptr) {
        LOGE("nativeSetEnv: failed to get UTF chars");
        if (key) env->ReleaseStringUTFChars(jkey, key);
        if (value) env->ReleaseStringUTFChars(jvalue, value);
        return -1;
    }
    
    LOGD("Setting env: %s=%s", key, value);
    
    // setenv(name, value, overwrite)
    // overwrite = 1 means replace existing value
    int result = setenv(key, value, 1);
    
    if (result == 0) {
        LOGD("Successfully set %s", key);
    } else {
        LOGE("Failed to set %s: %s", key, strerror(errno));
    }
    
    env->ReleaseStringUTFChars(jkey, key);
    env->ReleaseStringUTFChars(jvalue, value);
    
    return result;
}

/**
 * Get an environment variable using getenv()
 * Returns null if not found
 */
JNIEXPORT jstring JNICALL
Java_expo_modules_graftenv_ExpoGraftEnvModule_nativeGetEnv(
    JNIEnv *env,
    jobject /* this */,
    jstring jkey) {
    
    if (jkey == nullptr) {
        LOGE("nativeGetEnv: key is null");
        return nullptr;
    }
    
    const char *key = env->GetStringUTFChars(jkey, nullptr);
    if (key == nullptr) {
        LOGE("nativeGetEnv: failed to get UTF chars");
        return nullptr;
    }
    
    const char *value = getenv(key);
    
    jstring result = nullptr;
    if (value != nullptr) {
        result = env->NewStringUTF(value);
        LOGD("Got env: %s=%s", key, value);
    } else {
        LOGD("Env variable %s not found", key);
    }
    
    env->ReleaseStringUTFChars(jkey, key);
    
    return result;
}

/**
 * Unset an environment variable using unsetenv()
 * Returns 0 on success, -1 on failure
 */
JNIEXPORT jint JNICALL
Java_expo_modules_graftenv_ExpoGraftEnvModule_nativeUnsetEnv(
    JNIEnv *env,
    jobject /* this */,
    jstring jkey) {
    
    if (jkey == nullptr) {
        LOGE("nativeUnsetEnv: key is null");
        return -1;
    }
    
    const char *key = env->GetStringUTFChars(jkey, nullptr);
    if (key == nullptr) {
        LOGE("nativeUnsetEnv: failed to get UTF chars");
        return -1;
    }
    
    LOGD("Unsetting env: %s", key);
    
    int result = unsetenv(key);
    
    if (result == 0) {
        LOGD("Successfully unset %s", key);
    } else {
        LOGE("Failed to unset %s: %s", key, strerror(errno));
    }
    
    env->ReleaseStringUTFChars(jkey, key);
    
    return result;
}

} // extern "C"

