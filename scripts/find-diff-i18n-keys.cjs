const fs = require("fs")
const path = require("path")

// Read the JSON files
const enPath = path.join(__dirname, "../packages/locales/en.json")
const zhPath = path.join(__dirname, "../packages/locales/zh.json")

const enJson = require(enPath)
const zhJson = require(zhPath)

// Get all keys from both files
const enKeys = new Set(Object.keys(enJson))
const zhKeys = new Set(Object.keys(zhJson))

// Find keys that are in English but not in Chinese
const missingInZh = [...enKeys].filter((key) => !zhKeys.has(key))

// Find keys that are in Chinese but not in English
const missingInEn = [...zhKeys].filter((key) => !enKeys.has(key))

// Print results
if (missingInZh.length > 0) {
  console.log("\nKeys missing in zh.json:")
  missingInZh.forEach((key) => {
    console.log(`  ${key}: "${enJson[key]}"`)
  })
}

if (missingInEn.length > 0) {
  console.log("\nKeys missing in en.json:")
  missingInEn.forEach((key) => {
    console.log(`  ${key}: "${zhJson[key]}"`)
  })
}

if (missingInZh.length === 0 && missingInEn.length === 0) {
  console.log("No missing translations found! 🎉")
}

// Print summary
console.log("\nSummary:")
console.log(`Total keys in en.json: ${enKeys.size}`)
console.log(`Total keys in zh.json: ${zhKeys.size}`)
console.log(`Missing in zh.json: ${missingInZh.length}`)
console.log(`Missing in en.json: ${missingInEn.length}`)
