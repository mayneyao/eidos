/**
 * Test script to simulate port occupancy for Eidos Desktop
 * Usage: node test-port-occupancy.cjs [port]
 * Default port: 13127
 */

const net = require("net")

const PORT = parseInt(process.argv[2], 10) || 13127

const server = net.createServer()

server.on("error", (err) => {
  console.error(`Failed to bind to port ${PORT}:`, err.message)
  process.exit(1)
})

server.listen(PORT, "127.0.0.1", () => {
  console.log(`✅ Port ${PORT} is now occupied by test process`)
  console.log(`   PID: ${process.pid}`)
  console.log(`   Press Ctrl+C to release the port`)
})

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Shutting down test server...")
  server.close(() => {
    console.log(`✅ Port ${PORT} released`)
    process.exit(0)
  })
})

process.on("SIGTERM", () => {
  server.close(() => {
    process.exit(0)
  })
})
