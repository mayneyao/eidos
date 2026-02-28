/**
 * Eidos Headless Server
 * Entry point for the headless server application
 */

// Load .env file first
import dotenv from "dotenv"
dotenv.config({ override: true })

import { loadConfig } from "./config/env"
import { startServer } from "./server"
import { closeDataSpace } from "./data-space"

async function main() {
  console.log("╔════════════════════════════════════════╗")
  console.log("║         Eidos Headless Server          ║")
  console.log("╚════════════════════════════════════════╝")
  console.log("")

  // Load configuration
  const config = loadConfig()

  console.log("[Config] Data directory:", config.dataDir)
  console.log("[Config] Port:", config.port)
  console.log("[Config] Host:", config.host)
  console.log("[Config] API Auth:", config.apiKey ? "Enabled" : "Disabled")
  if (config.extensionHostnamePattern) {
    console.log("[Config] Extension Pattern:", config.extensionHostnamePattern)
  }
  if (config.sandboxHostnamePattern) {
    console.log("[Config] Sandbox Pattern:", config.sandboxHostnamePattern)
  }
  console.log("")

  // Start server
  await startServer(config)
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down...")
  closeDataSpace()
  process.exit(0)
})

process.on("SIGTERM", () => {
  console.log("\nShutting down...")
  closeDataSpace()
  process.exit(0)
})

// Run
main().catch((error) => {
  console.error("Failed to start server:", error)
  process.exit(1)
})
