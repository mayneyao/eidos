import { access, readFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const exampleRoot = join(root, "examples", "hello-eidos")
const manifestPath = join(exampleRoot, "extension.json")
const manifest = JSON.parse(await readFile(manifestPath, "utf8"))

const fail = (message) => {
  throw new Error(`hello-eidos: ${message}`)
}

if (manifest.manifestVersion !== 1) fail("manifestVersion must be 1")
if (!manifest.publisher || !manifest.name) fail("publisher and name are required")

const extensionId = `${manifest.publisher}.${manifest.name}`
const commands = manifest.contributes?.commands ?? []

if (commands.length === 0) fail("at least one command is required")

for (const command of commands) {
  if (!command.id.startsWith(`${extensionId}.`)) {
    fail(`command ${command.id} must start with ${extensionId}.`)
  }
}

for (const items of Object.values(manifest.contributes?.menus ?? {})) {
  for (const item of items) {
    if (!commands.some((command) => command.id === item.command)) {
      fail(`menu references unknown command ${item.command}`)
    }
  }
}

for (const entrypoint of Object.values(manifest.entrypoints ?? {})) {
  if (entrypoint.startsWith("/") || entrypoint.split("/").includes("..")) {
    fail(`entrypoint ${entrypoint} escapes the package`)
  }
  await access(join(exampleRoot, entrypoint))
}

console.log(`Validated ${extensionId}`)
