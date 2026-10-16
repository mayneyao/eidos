import { readFileSync } from "node:fs"
import path from "node:path"
import { parse } from "yaml"

export function usesGraftSourceSnapshot(workspace, lite) {
  const version = lite.dependencies?.["@eidos.space/graft"]
  return (
    typeof version === "string" &&
    /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version) &&
    workspace.overrides?.["@eidos.space/graft"] ===
      `file:vendor/graft-e2ee/eidos.space-graft-${version}.tgz`
  )
}

export function readGraftSourceSnapshotPolicy(root) {
  return usesGraftSourceSnapshot(
    parse(readFileSync(path.join(root, "pnpm-workspace.yaml"), "utf8")),
    JSON.parse(
      readFileSync(
        path.join(root, "apps/eidos-lite-desktop/package.json"),
        "utf8"
      )
    )
  )
}
