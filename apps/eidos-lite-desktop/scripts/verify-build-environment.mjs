import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const appRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const expectedName = process.argv[2]
const expected = {
  staging: {
    name: "staging",
    accountOrigin: "https://staging.eidos.space",
    billingOrigin: "https://staging.eidos.space",
    syncRemoteOrigin: "https://sync-staging.eidos.space",
  },
  production: {
    name: "production",
    accountOrigin: "https://eidos.space",
    billingOrigin: "https://eidos.space",
    syncRemoteOrigin: "https://sync.eidos.space",
  },
}[expectedName]

if (!expected) {
  throw new Error("Expected build environment must be staging or production")
}

const manifestPath = path.join(
  appRoot,
  "dist-electron",
  "eidos-lite-build-environment.json"
)
const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"))

if (JSON.stringify(manifest) !== JSON.stringify(expected)) {
  throw new Error(
    `Eidos Lite ${expectedName} build environment mismatch: ${JSON.stringify(manifest)}`
  )
}

console.log(
  `Verified Eidos Lite ${expectedName} build environment: ${manifest.accountOrigin} + ${manifest.syncRemoteOrigin}`
)
