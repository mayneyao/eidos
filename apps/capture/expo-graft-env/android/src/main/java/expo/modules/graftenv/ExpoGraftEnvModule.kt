package expo.modules.graftenv

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExpoGraftEnvModule : Module() {
  companion object {
    init {
      try {
        System.loadLibrary("expograftenv")
      } catch (e: Exception) {
        android.util.Log.e("ExpoGraftEnv", "Failed to load native library", e)
      }
    }
  }

  override fun definition() = ModuleDefinition {
    Name("ExpoGraftEnv")

    // Defines event names that the module can send to JavaScript.
    Events("onConfigChange")

    /**
     * Set environment variables for graft extension
     * On Android, we use JNI to call native setenv() function
     * This is necessary because graft extension reads configuration from environment
     */
    AsyncFunction("setEnvironmentVariables") { config: Map<String, String?> ->
      try {
        var successCount = 0
        var errorMessage: String? = null
        
        config.forEach { (key, value) ->
          if (value != null) {
            val result = nativeSetEnv(key, value)
            if (result == 0) {
              successCount++
            } else {
              errorMessage = "Failed to set $key (error code: $result)"
            }
          }
        }
        
        if (errorMessage != null) {
          sendEvent("onConfigChange", mapOf(
            "success" to false,
            "message" to errorMessage
          ))
          throw Exception(errorMessage)
        } else {
          sendEvent("onConfigChange", mapOf(
            "success" to true,
            "message" to "Set $successCount environment variables successfully"
          ))
        }
      } catch (e: Exception) {
        sendEvent("onConfigChange", mapOf(
          "success" to false,
          "message" to "Failed to set environment variables: ${e.message}"
        ))
        throw e
      }
    }

    /**
     * Get an environment variable value
     */
    AsyncFunction("getEnvironmentVariable") { key: String ->
      nativeGetEnv(key)
    }

    /**
     * Clear all graft-related environment variables
     */
    AsyncFunction("clearEnvironmentVariables") {
      try {
        val graftKeys = listOf(
          "GRAFT_CONFIG",
          "AWS_ACCESS_KEY_ID",
          "AWS_SECRET_ACCESS_KEY",
          "AWS_REGION",
          "AWS_ENDPOINT"
        )
        
        var successCount = 0
        graftKeys.forEach { key ->
          val result = nativeUnsetEnv(key)
          if (result == 0) {
            successCount++
          }
        }
        
        sendEvent("onConfigChange", mapOf(
          "success" to true,
          "message" to "Cleared $successCount environment variables"
        ))
      } catch (e: Exception) {
        sendEvent("onConfigChange", mapOf(
          "success" to false,
          "message" to "Failed to clear environment variables: ${e.message}"
        ))
        throw e
      }
    }
  }

  /**
   * Native method to set environment variable using setenv()
   * Returns 0 on success, -1 on failure
   */
  private external fun nativeSetEnv(key: String, value: String): Int

  /**
   * Native method to get environment variable using getenv()
   * Returns null if not found
   */
  private external fun nativeGetEnv(key: String): String?

  /**
   * Native method to unset environment variable using unsetenv()
   * Returns 0 on success, -1 on failure
   */
  private external fun nativeUnsetEnv(key: String): Int
}
