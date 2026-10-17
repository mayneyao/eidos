import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { readGraftSourceSnapshotPolicy } from "./scripts/graft-snapshot-policy.mjs"

const appRoot = path.dirname(fileURLToPath(import.meta.url))
const config = JSON.parse(
  readFileSync(path.join(appRoot, "electron-builder.dev.json"), "utf8")
)
if (!readGraftSourceSnapshotPolicy(path.resolve(appRoot, "../.."))) {
  config.extraResources = config.extraResources.filter(
    (resource) => resource.to !== "graft-e2ee"
  )
}

export default config
