import { Database } from "bun:sqlite"
import { existsSync } from "fs"
import { execSync } from "child_process"

let isSetup = false
let customSQLitePath: string | null = null

/**
 * Setup custom SQLite for extension support on macOS
 * This function should only be called once per process
 */
export function setupCustomSQLite() {
  // Prevent multiple calls
  if (isSetup) {
    console.log("[SQLite] Already set up, skipping...")
    return
  }

  if (process.platform !== "darwin") {
    console.log("[SQLite] Not on macOS, using default SQLite")
    isSetup = true
    return
  }

  try {
    const brewPrefix = execSync("brew --prefix sqlite 2>/dev/null", {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()

    if (brewPrefix) {
      const possiblePaths = [
        `${brewPrefix}/lib/libsqlite3.dylib`,
        `${brewPrefix}/libsqlite3.dylib`,
      ]

      for (const libPath of possiblePaths) {
        if (existsSync(libPath)) {
          console.log(`[SQLite] Found Homebrew SQLite: ${libPath}`)
          customSQLitePath = libPath

          try {
            Database.setCustomSQLite(libPath)
            console.log(`[SQLite] ✓ Set custom SQLite successfully`)
            isSetup = true
            return
          } catch (error: any) {
            console.error(
              `[SQLite] Failed to set custom SQLite:`,
              error.message
            )
            console.log(`[SQLite] Will use system SQLite instead`)
            customSQLitePath = null
          }
        }
      }
    }
  } catch (error: any) {
    console.log(`[SQLite] Error checking Homebrew SQLite:`, error.message)
  }

  console.warn("[SQLite] ⚠️  Using system SQLite (extensions may not work)")
  isSetup = true
}

/**
 * Get the custom SQLite path if set
 */
export function getCustomSQLitePath(): string | null {
  return customSQLitePath
}

// Auto-setup when module is imported
setupCustomSQLite()
