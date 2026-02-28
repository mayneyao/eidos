import { existsSync } from "fs"
import path from "path"
import { getSpaceRegistry } from "@eidos.space/space-manager"
import { execSync } from "child_process"

interface OpenCommandOptions {
  path?: string
}

/**
 * Open a space in the Eidos desktop app (like "code .")
 *
 * This command:
 * 1. Checks if the target directory is a valid Eidos space
 * 2. Gets the space ID from the registry
 * 3. Opens the space using the eidos:// protocol URL
 */
export async function openCommand(options: OpenCommandOptions = {}) {
  console.log("🚀 Opening space in Eidos desktop app...\n")

  // Resolve target path
  const targetPath = path.resolve(options.path || process.cwd())
  const eidosPath = path.join(targetPath, ".eidos")

  // Check if directory is a space
  if (!existsSync(eidosPath)) {
    console.error("✗ Not an Eidos space!")
    console.error(`  No .eidos directory found in: ${targetPath}`)
    console.error("\n💡 To initialize a space, run: eidos init")
    process.exit(1)
  }

  // Check if database exists
  const dbPath = path.join(eidosPath, "db.sqlite3")
  if (!existsSync(dbPath)) {
    console.error("✗ Invalid Eidos space!")
    console.error(`  Database not found: ${dbPath}`)
    process.exit(1)
  }

  console.log(`📂 Space directory: ${targetPath}`)

  // Get space info from registry
  const registry = getSpaceRegistry()
  const spaces = registry.getAllSpaces()
  const space = spaces.find((s: any) => s.path === targetPath)

  if (!space) {
    console.error("✗ Space not registered!")
    console.error(`  This space is not in the global registry.`)
    console.error("\n💡 To register it, you can run: eidos init")
    console.error("   (This will detect and register existing spaces)")
    process.exit(1)
  }

  console.log(`📝 Space name: ${space.name}`)
  console.log(`🆔 Space ID: ${space.id}`)

  // Construct eidos:// protocol URL
  const protocolUrl = `eidos://open-space?space=${encodeURIComponent(space.id)}&path=${encodeURIComponent(targetPath)}`

  console.log(`\n🔗 Opening: ${protocolUrl}`)

  // Open using system default handler
  try {
    openUrl(protocolUrl)
    console.log("\n✓ Sent open request to Eidos desktop app")
    console.log(
      "  If the app doesn't open, make sure it's installed and running."
    )
  } catch (error: any) {
    console.error("\n✗ Failed to open desktop app:", error.message)
    console.error("\n💡 Make sure the Eidos desktop app is installed.")
    process.exit(1)
  }
}

/**
 * Open a URL using the system's default handler
 */
function openUrl(url: string): void {
  const platform = process.platform

  try {
    if (platform === "darwin") {
      // macOS
      execSync(`open "${url}"`, { stdio: "ignore" })
    } else if (platform === "win32") {
      // Windows
      execSync(`start "" "${url}"`, { stdio: "ignore" })
    } else {
      // Linux and others
      execSync(`xdg-open "${url}"`, { stdio: "ignore" })
    }
  } catch (error: any) {
    throw new Error(`Failed to open URL: ${error.message}`)
  }
}
