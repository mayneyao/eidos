import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { readGraftSourceSnapshotPolicy } from "./graft-snapshot-policy.mjs"
import {
  resolveSparkPublicKey,
  verifySparkKeyArtifact,
} from "./spark-key-policy.mjs"

const appRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const expectedName = process.argv[2]
const expected = {
  staging: {
    name: "staging",
    accountOrigin: "https://staging.eidos.space",
    billingOrigin: "https://staging.eidos.space",
    publishOrigin: "https://publish-staging.eidos.space",
    syncRemoteOrigin: "https://sync-staging.eidos.space",
  },
  production: {
    name: "production",
    accountOrigin: "https://eidos.space",
    billingOrigin: "https://eidos.space",
    publishOrigin: "https://publish.eidos.space",
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

const electronOutput = path.join(appRoot, "dist-electron")
const sparkKey = resolveSparkPublicKey(expectedName)
verifySparkKeyArtifact(
  JSON.parse(
    await fs.readFile(
      path.join(electronOutput, "spark-key-build-policy.json"),
      "utf8"
    )
  ),
  sparkKey,
  await Promise.all(
    (await fs.readdir(electronOutput))
      .filter((name) => name.endsWith(".js"))
      .map((name) => fs.readFile(path.join(electronOutput, name), "utf8"))
  )
)
console.log(
  `Verified Spark ${expectedName} public key SHA-256: ${sparkKey.sha256}`
)

const graftPolicy = JSON.parse(
  await fs.readFile(
    path.join(appRoot, "dist-electron/graft-sdk-build-policy.json"),
    "utf8"
  )
)
const expectedSourceSnapshot =
  expectedName === "staging" &&
  readGraftSourceSnapshotPolicy(path.resolve(appRoot, "../.."))
if (graftPolicy.sourceSnapshot !== expectedSourceSnapshot) {
  throw new Error(
    "Graft SDK source changed after this build; rebuild before packaging"
  )
}

console.log(
  `Verified Eidos Lite ${expectedName} build environment: ${manifest.accountOrigin} + ${manifest.publishOrigin} + ${manifest.syncRemoteOrigin}`
)
