import { execFileSync } from "node:child_process"
import { mkdir, copyFile, chmod } from "node:fs/promises"
import path from "node:path"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
)
export async function preparePluginSandbox({
  repository = root,
  platform = process.platform,
  architecture = process.arch,
} = {}) {
  const sandbox = path.join(repository, "packages/plugin-sandbox")
  const require = createRequire(path.join(sandbox, "package.json"))
  execFileSync(
    process.execPath,
    [require.resolve("typescript/bin/tsc"), "-p", "tsconfig.build.json"],
    {
      cwd: sandbox,
      stdio: "inherit",
    }
  )
  execFileSync(
    process.execPath,
    [path.join(sandbox, "scripts/build-native.mjs")],
    {
      cwd: repository,
      stdio: "inherit",
    }
  )
  const name = platform === "win32" ? "plugin-sandbox.exe" : "plugin-sandbox"
  const destination = path.join(
    repository,
    "apps/eidos-lite-desktop/resources/plugin-sandbox"
  )
  await mkdir(destination, { recursive: true })
  await copyFile(
    path.join(
      repository,
      "packages/plugin-sandbox/bin",
      `${platform}-${architecture}`,
      name
    ),
    path.join(destination, name)
  )
  await chmod(path.join(destination, name), 0o755)
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await preparePluginSandbox()
}
