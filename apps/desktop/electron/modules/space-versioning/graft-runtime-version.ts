import graftRuntimeManifest from "../../../graft-runtime-manifest.json"

export const EXPECTED_GRAFT_RUNTIME_VERSION = graftRuntimeManifest.version

export function assertGraftRuntimeVersion(
  output: unknown,
  component: "CLI" | "SQLite extension"
): void {
  if (
    typeof output !== "string" ||
    !new RegExp(
      `(?:^|\\s)(?:graft-tool\\s+|Graft Version:\\s*)${EXPECTED_GRAFT_RUNTIME_VERSION}(?:\\s|$)`,
      "m"
    ).test(output)
  ) {
    throw new Error(
      `Bundled Graft ${component} is not the required v${EXPECTED_GRAFT_RUNTIME_VERSION} runtime`
    )
  }
}
