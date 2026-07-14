import { access, readFile, readdir } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import Ajv2020 from "ajv/dist/2020.js"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const repositoryRoot = resolve(root, "../..")
const examplesRoot = join(root, "examples")
const exampleNames = await readdir(examplesRoot)
const packageSchemaPath = join(
  repositoryRoot,
  "packages/extension-manifest/schema/extension-manifest.schema.json"
)
const publicSchemaPath = join(
  root,
  "public/schemas/extension-manifest.schema.json"
)
const [packageSchemaText, publicSchemaText] = await Promise.all([
  readFile(packageSchemaPath, "utf8"),
  readFile(publicSchemaPath, "utf8"),
])
if (packageSchemaText !== publicSchemaText) {
  throw new Error(
    "Public extension manifest schema is out of sync with @eidos.space/extension-manifest"
  )
}
const schema = JSON.parse(packageSchemaText)
const validateManifest = new Ajv2020({
  allErrors: true,
  formats: {
    uri: (value) => {
      try {
        new URL(value)
        return true
      } catch {
        return false
      }
    },
  },
  strict: true,
}).compile(schema)

for (const exampleName of exampleNames) {
  const exampleRoot = join(examplesRoot, exampleName)
  const manifestPath = join(exampleRoot, "extension.json")
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"))

  const fail = (message) => {
    throw new Error(`${exampleName}: ${message}`)
  }

  if (!validateManifest(manifest)) {
    fail(
      `manifest does not match the public schema:\n${validateManifest.errors
        .map((error) => `  ${error.instancePath || "/"} ${error.message}`)
        .join("\n")}`
    )
  }

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
}
