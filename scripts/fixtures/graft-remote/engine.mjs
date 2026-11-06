import { readFileSync, realpathSync } from "node:fs"
import { fileURLToPath } from "node:url"

export const prepareCommand =
  "npm ci --prefix scripts/fixtures/graft-remote --ignore-scripts --no-audit --no-fund"

export async function loadFixtureEngine() {
  if (Number(process.versions.node.split(".")[0]) < 20)
    throw new Error(
      "The official Graft test fixture requires Node.js 20 or newer."
    )
  try {
    // Require this fixture's installation even when the workspace has another
    // copy. A missing fixture package must never fall back to ancestor modules.
    const localPackage = new URL(
      "./node_modules/@eidos.space/graft-remote/package.json",
      import.meta.url
    )
    const installed = JSON.parse(readFileSync(localPackage, "utf8"))
    if (
      installed.name !== "@eidos.space/graft-remote" ||
      installed.version !== "0.2.6"
    )
      throw new Error(
        "Expected the fixture-owned @eidos.space/graft-remote 0.2.6."
      )
    const resolved = import.meta.resolve("@eidos.space/graft-remote")
    const expected = new URL("./dist/index.js", localPackage)
    if (
      realpathSync(fileURLToPath(resolved)) !==
      realpathSync(fileURLToPath(expected))
    )
      throw new Error(
        "The Graft test fixture resolved outside its own package."
      )
    const engine = await import(resolved)
    if (
      typeof engine.createGraftRemoteHandler !== "function" ||
      typeof engine.GraftProtocolError !== "function"
    )
      throw new Error("The official Graft fixture exports are unavailable.")
    return engine
  } catch (cause) {
    throw new Error(
      `Official Graft test fixture dependency is missing or invalid. From the repository root run: ${prepareCommand}`,
      { cause }
    )
  }
}
