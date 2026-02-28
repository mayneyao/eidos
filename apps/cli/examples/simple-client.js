#!/usr/bin/env node

/**
 * Simple Eidos CLI API Client Example
 *
 * This demonstrates how to interact with an Eidos space via the HTTP API.
 *
 * Prerequisites:
 *   1. Initialize a space: eidos init
 *   2. Start the server: eidos serve
 *
 * Usage:
 *   node examples/simple-client.js
 */

const API_URL = "http://localhost:13128/rpc"

/**
 * Call an RPC method
 */
async function rpc(method, params = []) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method, params }),
  })

  const result = await response.json()

  if (!result.success) {
    throw new Error(result.error || "RPC call failed")
  }

  return result.data
}

/**
 * Main demo
 */
async function main() {
  console.log("🚀 Eidos CLI API Client Example\n")

  try {
    // Check server health
    console.log("1️⃣  Checking server health...")
    const health = await fetch("http://localhost:13128/health")
    console.log(
      `   Status: ${health.status === 200 ? "✅ Healthy" : "❌ Unhealthy"}\n`
    )

    // List documents
    console.log("2️⃣  Listing documents...")
    const docs = await rpc("doc.findMany")
    console.log(`   Found ${docs.length} document(s)\n`)

    if (docs.length > 0) {
      console.log("   First document:")
      console.log(`   - ID: ${docs[0].id}`)
      console.log(`   - Title: ${docs[0].title || "(untitled)"}\n`)
    }

    // List tables
    console.log("3️⃣  Listing tables...")
    const tables = await rpc("table.list")
    console.log(`   Found ${tables.length} table(s)\n`)

    console.log("✅ All operations completed successfully!\n")
    console.log("💡 Try modifying this script to:")
    console.log(
      '   - Create documents: rpc("doc.create", [{title: "New Doc"}])'
    )
    console.log(
      '   - Query tables: rpc("table.query", [tableName, { limit: 10 }])'
    )
    console.log('   - Get space info: rpc("space.info")')
  } catch (error) {
    console.error("\n❌ Error:", error.message)
    console.error("\n💡 Make sure:")
    console.error("   1. You have initialized a space (eidos init)")
    console.error("   2. The server is running (eidos serve)")
    console.error("   3. The server is accessible at", API_URL)
    process.exit(1)
  }
}

main()
