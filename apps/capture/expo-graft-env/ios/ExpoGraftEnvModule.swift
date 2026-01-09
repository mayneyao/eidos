import ExpoModulesCore
import Foundation

public class ExpoGraftEnvModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoGraftEnv")

    // Defines event names that the module can send to JavaScript.
    Events("onConfigChange")

    /**
     * Set environment variables for graft extension
     * On iOS, we use setenv() to set environment variables in the process
     */
    AsyncFunction("setEnvironmentVariables") { (config: [String: String?]) in
      do {
        for (key, value) in config {
          if let unwrappedValue = value {
            self.setEnvironmentVariable(key: key, value: unwrappedValue)
          }
        }
        
        // Send success event
        self.sendEvent("onConfigChange", [
          "success": true,
          "message": "Environment variables set successfully"
        ])
      } catch {
        self.sendEvent("onConfigChange", [
          "success": false,
          "message": "Failed to set environment variables: \(error.localizedDescription)"
        ])
        throw error
      }
    }

    /**
     * Get an environment variable value
     */
    AsyncFunction("getEnvironmentVariable") { (key: String) -> String? in
      guard let value = getenv(key) else {
        return nil
      }
      return String(cString: value)
    }

    /**
     * Clear all graft-related environment variables
     */
    AsyncFunction("clearEnvironmentVariables") {
      do {
        let graftKeys = [
          "GRAFT_CONFIG",
          "AWS_ACCESS_KEY_ID",
          "AWS_SECRET_ACCESS_KEY",
          "AWS_REGION",
          "AWS_ENDPOINT"
        ]
        
        for key in graftKeys {
          self.removeEnvironmentVariable(key: key)
        }
        
        self.sendEvent("onConfigChange", [
          "success": true,
          "message": "Environment variables cleared"
        ])
      } catch {
        self.sendEvent("onConfigChange", [
          "success": false,
          "message": "Failed to clear environment variables: \(error.localizedDescription)"
        ])
        throw error
      }
    }
  }

  /**
   * Set an environment variable using setenv()
   * This makes the variable available to child processes and C libraries
   */
  private func setEnvironmentVariable(key: String, value: String) {
    setenv(key, value, 1)
  }

  /**
   * Remove an environment variable using unsetenv()
   */
  private func removeEnvironmentVariable(key: String) {
    unsetenv(key)
  }
}
