import { readFile, realpath } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"))
const expected = {
  "@eidos.space/eidos-file": "0.1.0",
  "@eidos.space/eidos-file-ui": "0.1.0",
}
const allowTarballs = process.env.EIDOS_FILE_ALLOW_TARBALLS === "1"

for (const [name, version] of Object.entries(expected)) {
  const requested = manifest.dependencies[name]
  const validRequest = allowTarballs
    ? typeof requested === "string" &&
      requested.startsWith("file:") &&
      requested.endsWith(".tgz")
    : requested === version
  if (!validRequest) {
    throw new Error(`${name} must stay pinned to ${version}`)
  }
  const installed = await realpath(
    join(root, "node_modules", ...name.split("/"))
  )
  const installedManifest = JSON.parse(
    await readFile(join(installed, "package.json"), "utf8")
  )
  if (installedManifest.version !== version) {
    throw new Error(`${name} resolved to ${installedManifest.version}`)
  }
  if (installed.startsWith(resolve(root, "..", "..", "packages"))) {
    throw new Error(
      `${name} resolved to the Eidos monorepo instead of an install`
    )
  }
  console.log(`${name}@${version} -> ${installed}`)
}
